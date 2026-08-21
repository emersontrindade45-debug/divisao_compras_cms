"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { normalizarMunicipio } from "@/lib/domain/normalizarMunicipio";
import { mascararCnpj } from "@/lib/domain/cnpj";
import { buscarCandidatosCnpjSchema } from "@/lib/validations/candidatosCnpj";
import {
  adicionarCandidatoNaPlanilha,
  FONTE_CANDIDATOS_CNPJ,
} from "@/lib/sheets/escreverCandidatoNaPlanilha";
import type { ActionResult } from "./processos";

// Só SP foi importado nesta entrega do M27 (ver docs/PLAN.md) — sem seletor de
// UF na UI, e fixo aqui para nunca depender de entrada do usuário.
const ESTADO_IMPORTADO = "SP";

const TAMANHO_PAGINA = 50;

export interface CandidatoCnpjResultado {
  id: string;
  /** Sem máscara (14 dígitos) — formato bruto de `EmpresaCandidataFornecedor.cnpj`. */
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  municipio: string;
  estado: string;
  cnaePrincipalCodigo: string;
  cnaePrincipalDescricao: string;
  categoriaSugerida: string[];
  /** `true` quando já existe um `Fornecedor` com este CNPJ. */
  jaEhFornecedor: boolean;
}

export interface BuscaCandidatosCnpjResultado {
  candidatos: CandidatoCnpjResultado[];
  /** Cursor da próxima página (`cnpj` sem máscara do último candidato desta página), ou `null`. */
  proximoCursor: string | null;
}

/**
 * Busca paginada (cursor por `cnpj`, nunca offset) de candidatos a Fornecedor
 * importados da Receita Federal (M27). `municipio` é obrigatório — sem ele a
 * função nem monta a query, para nunca fazer seq scan da tabela inteira
 * (potencialmente milhões de linhas, só indexada por `[estado, municipio]`
 * e `categoriaSugerida`).
 */
export async function buscarCandidatosCnpj(
  input: unknown,
): Promise<ActionResult<BuscaCandidatosCnpjResultado>> {
  await requireAuth();

  const parsed = buscarCandidatosCnpjSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Filtro inválido" };
  }

  const { municipio, cnae, categoria, busca, cursor } = parsed.data;
  const municipioNormalizado = normalizarMunicipio(municipio);

  const where: Prisma.EmpresaCandidataFornecedorWhereInput = {
    estado: ESTADO_IMPORTADO,
    municipio: municipioNormalizado,
    ...(cursor ? { cnpj: { gt: cursor } } : {}),
    ...(cnae ? { cnaePrincipalCodigo: { startsWith: cnae } } : {}),
    ...(categoria ? { categoriaSugerida: { has: categoria } } : {}),
    ...(busca ? { razaoSocial: { contains: busca, mode: "insensitive" } } : {}),
  };

  const registros = await db.empresaCandidataFornecedor.findMany({
    where,
    select: {
      id: true,
      cnpj: true,
      razaoSocial: true,
      nomeFantasia: true,
      municipio: true,
      estado: true,
      cnaePrincipalCodigo: true,
      cnaePrincipalDescricao: true,
      categoriaSugerida: true,
    },
    orderBy: { cnpj: "asc" },
    // +1 para saber se há próxima página sem um COUNT(*) à parte (caro numa
    // tabela de milhões de linhas).
    take: TAMANHO_PAGINA + 1,
  });

  const temProximaPagina = registros.length > TAMANHO_PAGINA;
  const pagina = temProximaPagina ? registros.slice(0, TAMANHO_PAGINA) : registros;

  const cnpjsMascaradosDaPagina = pagina.map((c) => mascararCnpj(c.cnpj));
  const fornecedoresExistentes =
    cnpjsMascaradosDaPagina.length > 0
      ? await db.fornecedor.findMany({
          where: { cnpj: { in: cnpjsMascaradosDaPagina } },
          select: { cnpj: true },
        })
      : [];
  const cnpjsJaFornecedor = new Set(fornecedoresExistentes.map((f) => f.cnpj));

  return {
    data: {
      candidatos: pagina.map((c) => ({
        ...c,
        jaEhFornecedor: cnpjsJaFornecedor.has(mascararCnpj(c.cnpj)),
      })),
      proximoCursor: temProximaPagina ? pagina[pagina.length - 1]!.cnpj : null,
    },
  };
}

// UUID, não CUID: `EmpresaCandidataFornecedor.id` é gravado por SQL bruto
// (`gen_random_uuid()` em `importarCandidatosCnpj.ts`, necessário para o
// upsert em lote via `INSERT ... ON CONFLICT`), nunca pelo Prisma Client —
// o `@default(cuid())` do schema só vale quando o Client gera o id, o que
// não é o caso aqui. Confirmado nos 8,66M registros de produção: 0 CUID.
const candidatoIdSchema = z.string().uuid();

export interface AdicionarCandidatoResultado {
  linhaId: string;
  jaExistente: boolean;
}

/**
 * Escreve um candidato a Fornecedor como linha nova na planilha Google de
 * fornecedores (M24) — NÃO cria `Fornecedor` diretamente (ver decisão em
 * docs/PLAN.md M27 etapa 6: a planilha é o registro mestre e o sync manual já
 * tolera CNPJ/e-mail ausentes, comum nos candidatos da Receita). Erro da
 * Sheets API propaga sem retry, mesmo padrão de `preencherPrecosPublicos`
 * (chamado de `promoverFonte.ts`) — vira `{ error }` amigável para a UI.
 */
export async function adicionarCandidatoAPlanilha(
  candidatoId: string,
): Promise<ActionResult<AdicionarCandidatoResultado>> {
  const user = await requireRole("pesquisa");

  const parsedId = candidatoIdSchema.safeParse(candidatoId);
  if (!parsedId.success) return { error: "Identificador de candidato inválido" };

  const candidato = await db.empresaCandidataFornecedor.findUnique({
    where: { id: parsedId.data },
    select: {
      id: true,
      cnpj: true,
      razaoSocial: true,
      municipio: true,
      estado: true,
      email: true,
      telefone: true,
    },
  });
  if (!candidato) return { error: "Candidato não encontrado" };

  let resultado: AdicionarCandidatoResultado;
  try {
    resultado = await adicionarCandidatoNaPlanilha({
      cnpj: mascararCnpj(candidato.cnpj),
      razaoSocial: candidato.razaoSocial,
      cidade: candidato.municipio,
      estado: candidato.estado,
      email: candidato.email ?? "",
      telefone: candidato.telefone ?? "",
      fonte: FONTE_CANDIDATOS_CNPJ,
    });
  } catch (erro) {
    return {
      error:
        erro instanceof Error
          ? erro.message
          : "Falha ao escrever na planilha de fornecedores.",
    };
  }

  // Auditoria só depois da escrita ter tido sucesso (inclusive quando é
  // dedupe — `jaExistente: true` não é erro, é um resultado legítimo da
  // ação, e fica registrado como tal).
  await registrarAuditoria({
    userId: user.id,
    acao: "adicionar_candidato_planilha",
    detalhes: {
      candidatoId: candidato.id,
      cnpj: candidato.cnpj,
      linhaId: resultado.linhaId,
      jaExistente: resultado.jaExistente,
    },
  });

  return { data: resultado };
}

interface CacheMunicipios {
  valor: string[];
  expiraEm: number;
}

// Cache em memória do processo (module-level), não `unstable_cache`: esta função precisa
// funcionar tanto chamada de uma página (Server Component) quanto de um teste/script — e
// `unstable_cache` exige o `IncrementalCache` do runtime do Next, ausente fora do fluxo de
// requisição normal (`Invariant: incrementalCache missing`, confirmado tentando a abordagem e
// vendo o teste falhar com esse erro exato). TTL de 1h é suficiente: import de candidato é
// evento raro/manual (script administrativo), nunca em tempo real — cidade nova só aparece no
// dropdown depois desse intervalo, o que é aceitável.
let cacheMunicipios: CacheMunicipios | null = null;
const TTL_CACHE_MUNICIPIOS_MS = 60 * 60 * 1000;

/**
 * Municípios de `ESTADO_IMPORTADO` que têm ao menos um candidato — alimenta o dropdown de
 * Município em `/fornecedores/descobrir`, mesmo padrão do dropdown de Categoria (lista só o que
 * existe, evita usuário digitar cidade sem candidato nenhum ou com erro de acento/grafia — que
 * já causou um bug real, ver CLAUDE.md e docs/PLAN.md M27).
 *
 * `GROUP BY estado, municipio` em vez de `DISTINCT municipio`: nenhum índice cobre valor distinto
 * de coluna (nem o `[estado, município]` existente — Postgres não faz "loose index scan"
 * nativamente), então é sequential scan de qualquer forma. Medido contra os 8,66M candidatos
 * locais: **~14s por chamada, fria ou não** — inaceitável rodar isso a cada carregamento de
 * página sem cache.
 */
export async function listarMunicipiosComCandidatos(): Promise<string[]> {
  await requireAuth();

  if (cacheMunicipios && cacheMunicipios.expiraEm > Date.now()) {
    return cacheMunicipios.valor;
  }

  const linhas = await db.empresaCandidataFornecedor.groupBy({
    by: ["municipio"],
    where: { estado: ESTADO_IMPORTADO },
    orderBy: { municipio: "asc" },
  });
  const valor = linhas.map((l) => l.municipio);

  cacheMunicipios = { valor, expiraEm: Date.now() + TTL_CACHE_MUNICIPIOS_MS };
  return valor;
}
