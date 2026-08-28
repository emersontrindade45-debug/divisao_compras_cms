"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { dbCandidatos } from "@/lib/dbCandidatos";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { normalizarMunicipio } from "@/lib/domain/normalizarMunicipio";
import { mascararCnpj } from "@/lib/domain/cnpj";
import { buscarCandidatosCnpjSchema, ESTADOS_CANDIDATOS_CNPJ } from "@/lib/validations/candidatosCnpj";
import {
  adicionarCandidatoNaPlanilha,
  FONTE_CANDIDATOS_CNPJ,
} from "@/lib/sheets/escreverCandidatoNaPlanilha";
import type { ActionResult } from "./processos";

const TAMANHO_PAGINA = 50;

/** Codifica o cursor de paginação como `<0|1><cnpj>` — o prefixo carrega `sicafHabilitado` porque a
 * ordenação primária é por ele; sem isso, retomar só por `cnpj` pularia/repetiria linhas ao cruzar
 * do grupo "habilitado no SICAF" para o grupo comum. */
function codificarCursor(candidato: { sicafHabilitado: boolean; cnpj: string }): string {
  return `${candidato.sicafHabilitado ? "1" : "0"}${candidato.cnpj}`;
}

function decodificarCursor(cursor: string): { sicafHabilitado: boolean; cnpj: string } {
  const flag = cursor.charAt(0);
  if (flag === "0" || flag === "1") {
    return { sicafHabilitado: flag === "1", cnpj: cursor.slice(1) };
  }
  // Cursor não reconhecido (ex.: URL editada à mão) — trata como continuação do grupo comum,
  // nunca quebra a página com erro.
  return { sicafHabilitado: false, cnpj: cursor };
}

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
  /** `true` = cadastrado e habilitado a licitar no SICAF (compras.gov.br) — prioridade na lista. */
  sicafHabilitado: boolean;
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

  const { estado, municipio, cnae, categoria, busca, cursor } = parsed.data;
  const municipioNormalizado = normalizarMunicipio(municipio);

  const filtrosBase: Prisma.EmpresaCandidataFornecedorWhereInput = {
    estado,
    municipio: municipioNormalizado,
    ...(cnae ? { cnaePrincipalCodigo: { startsWith: cnae } } : {}),
    ...(categoria ? { categoriaSugerida: { has: categoria } } : {}),
    ...(busca ? { razaoSocial: { contains: busca, mode: "insensitive" } } : {}),
  };

  // Ordenação prioriza `sicafHabilitado` (quem já licita com o governo federal aparece primeiro —
  // pedido do usuário), com `cnpj` como desempate estável. O cursor carrega os dois: continuar só
  // por `cnpj` depois de trocar a ordenação quebraria a paginação bem no ponto em que a lista passa
  // do grupo "habilitado" para o comum (repetiria ou pularia linhas).
  const filtroCursor = (() => {
    if (!cursor) return null;
    const { sicafHabilitado, cnpj } = decodificarCursor(cursor);
    if (sicafHabilitado) {
      // Próxima linha: ou ainda dentro do grupo habilitado (cnpj maior), ou qualquer linha do
      // grupo comum (que vem inteiro depois, na ordenação desc).
      return {
        OR: [
          { sicafHabilitado: true, cnpj: { gt: cnpj } },
          { sicafHabilitado: false },
        ],
      };
    }
    // Já estava no grupo comum — não há mais nada "antes" dele para pular.
    return { sicafHabilitado: false, cnpj: { gt: cnpj } };
  })();

  const where: Prisma.EmpresaCandidataFornecedorWhereInput = filtroCursor
    ? { AND: [filtrosBase, filtroCursor] }
    : filtrosBase;

  const registros = await dbCandidatos.empresaCandidataFornecedor.findMany({
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
      sicafHabilitado: true,
    },
    orderBy: [{ sicafHabilitado: "desc" }, { cnpj: "asc" }],
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
      proximoCursor: temProximaPagina ? codificarCursor(pagina[pagina.length - 1]!) : null,
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
 *
 * A coluna "Tags" vem de `candidato.categoriaSugerida`, calculada por CNAE (não por objeto de
 * processo) em `categorizarCandidatosCnae.ts` — decisão do usuário (2026-08-24): o CNAE da própria
 * empresa é a referência, não o cadastro pré-existente de `Fornecedor.categoria` nem o objeto do
 * processo que a trouxe à busca (a mesma empresa pode aparecer em processos de objetos diferentes).
 */
export async function adicionarCandidatoAPlanilha(
  candidatoId: string,
  numeroProcesso?: string,
): Promise<ActionResult<AdicionarCandidatoResultado>> {
  const user = await requireRole("pesquisa");

  const parsedId = candidatoIdSchema.safeParse(candidatoId);
  if (!parsedId.success) return { error: "Identificador de candidato inválido" };

  const candidato = await dbCandidatos.empresaCandidataFornecedor.findUnique({
    where: { id: parsedId.data },
    select: {
      id: true,
      cnpj: true,
      razaoSocial: true,
      municipio: true,
      estado: true,
      email: true,
      telefone: true,
      categoriaSugerida: true,
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
      categoria: candidato.categoriaSugerida,
      numeroProcesso,
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
      numeroProcesso,
    },
  });

  return { data: resultado };
}

interface CacheMunicipios {
  valor: MunicipioComCandidatos[];
  expiraEm: number;
}

// Cache em memória do processo (module-level), não `unstable_cache`: esta função precisa
// funcionar tanto chamada de uma página (Server Component) quanto de um teste/script — e
// `unstable_cache` exige o `IncrementalCache` do runtime do Next, ausente fora do fluxo de
// requisição normal (`Invariant: incrementalCache missing`, confirmado tentando a abordagem e
// vendo o teste falhar com esse erro exato).
//
// TTL de 5min (era 1h até 2026-08-21): o TTL de 1h causou dor real, não só hipotética — depois
// da carga completa dos 8,66M candidatos rodar em produção, o dropdown de Município continuou
// mostrando só "São Paulo" (dado da amostra anterior de 500) por mais de 1h, porque instâncias de
// função Fluid Compute continuam vivas e servindo requisições bem depois de um redeploy — um
// `readyState: READY` novo não mata as instâncias antigas na hora. Import de candidato continua
// sendo evento raro/manual, mas 5min é um atraso imperceptível pra esse caso e limita o estrago de
// uma instância presa com cache velho a uma janela curta.
let cacheMunicipios: CacheMunicipios | null = null;
const TTL_CACHE_MUNICIPIOS_MS = 5 * 60 * 1000;

export interface MunicipioComCandidatos {
  municipio: string;
  estado: string;
}

/**
 * Municípios de UMA UF que têm ao menos um candidato — skip scan de coluna única, mesma consulta
 * medida em produção (182ms contra 8,66M linhas de SP). Ver `listarMunicipiosComCandidatos` para
 * por que isso roda 1x por UF em paralelo em vez de 1 consulta composta.
 */
async function municipiosDaUf(estado: string): Promise<string[]> {
  const linhas = await dbCandidatos.$queryRaw<Array<{ municipio: string }>>`
    WITH RECURSIVE municipios AS (
      (
        SELECT "municipio"
        FROM "empresas_candidatas_fornecedor"
        WHERE "estado" = ${estado}
        ORDER BY "municipio"
        LIMIT 1
      )
      UNION ALL
      SELECT (
        SELECT "municipio"
        FROM "empresas_candidatas_fornecedor"
        WHERE "estado" = ${estado}
          AND "municipio" > municipios."municipio"
        ORDER BY "municipio"
        LIMIT 1
      )
      FROM municipios
      WHERE municipios."municipio" IS NOT NULL
    )
    SELECT "municipio"
    FROM municipios
    WHERE "municipio" IS NOT NULL
    ORDER BY "municipio"
  `;
  return linhas.map((l) => l.municipio);
}

/**
 * Pares (município, UF) com ao menos um candidato, nas UFs importadas (`ESTADOS_CANDIDATOS_CNPJ`)
 * — alimenta o dropdown de Município em `/fornecedores/descobrir`, mesmo padrão do dropdown de
 * Categoria (lista só o que existe, evita usuário digitar cidade sem candidato nenhum ou com erro
 * de acento/grafia — que já causou um bug real, ver CLAUDE.md e docs/PLAN.md M27).
 *
 * Devolve o PAR, não só o nome: expandido para o Sudeste inteiro (SP+MG+RJ+ES), nomes de
 * município colidem entre UFs vizinhas (medido: "Rio Claro" em SP e RJ, "Cantagalo" em MG e RJ,
 * mais 7 outros) — um dropdown só com o nome deixaria o usuário escolher a cidade errada sem
 * saber, e a busca misturaria candidatos de duas cidades diferentes.
 *
 * Implementado como **4 skip scans de coluna única em paralelo** (1 por UF, `municipiosDaUf`),
 * não como 1 consulta composta por (estado, município). Uma versão com `WITH RECURSIVE` +
 * `LATERAL` avançando o PAR de colunas foi tentada e descartada por medição: o plano do
 * `EXPLAIN` parecia barato (`Index Cond` com o comparador de linha, custo estimado ~18), mas a
 * execução real não bate com a estimativa — medido em produção: 10 pares em 100ms, 50 pares em
 * 4,2s, 150 pares estourou o timeout de 20s (crescimento muito pior que linear). A causa provável
 * é a combinação de `estado = ANY(4 valores)` com o comparador de linha, que o planner não
 * otimiza tão bem quanto uma igualdade simples — mas a causa exata importa menos que o fato
 * medido: essa forma não escala. A versão com 4 consultas separadas (`estado = <valor>`, sem
 * `ANY`) é a mesma exata forma já validada em produção; 4 delas em paralelo somaram ~1s no VPS.
 */
export async function listarMunicipiosComCandidatos(): Promise<MunicipioComCandidatos[]> {
  await requireAuth();

  if (cacheMunicipios && cacheMunicipios.expiraEm > Date.now()) {
    return cacheMunicipios.valor;
  }

  const porUf = await Promise.all(
    ESTADOS_CANDIDATOS_CNPJ.map(async (estado) => ({
      estado,
      municipios: await municipiosDaUf(estado),
    })),
  );

  const valor = porUf
    .flatMap(({ estado, municipios }) => municipios.map((municipio) => ({ estado, municipio })))
    .sort(
      (a, b) =>
        a.municipio.localeCompare(b.municipio, "pt-BR") || a.estado.localeCompare(b.estado),
    );

  cacheMunicipios = { valor, expiraEm: Date.now() + TTL_CACHE_MUNICIPIOS_MS };
  return valor;
}
