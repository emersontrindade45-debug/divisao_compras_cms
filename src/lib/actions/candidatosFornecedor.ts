"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { normalizarMunicipio } from "@/lib/domain/normalizarMunicipio";
import { formatarCnpj } from "@/lib/validations/fornecedor";
import type { ActionResult } from "./processos";

export const TAMANHO_PAGINA_CANDIDATOS = 50;
const PAGINA_MAXIMA = 100;

const SELECT_CANDIDATO = {
  id: true,
  cnpj: true,
  razaoSocial: true,
  nomeFantasia: true,
  municipio: true,
  estado: true,
  cnaePrincipalCodigo: true,
  cnaePrincipalDescricao: true,
  categoriaSugerida: true,
  email: true,
  telefone: true,
} as const;

export interface CandidatoFornecedorListItem {
  id: string;
  cnpj: string;
  cnpjMascarado: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  municipio: string;
  estado: string;
  cnaePrincipalCodigo: string;
  cnaePrincipalDescricao: string;
  categoriaSugerida: string[];
  email: string | null;
  telefone: string | null;
  jaCadastrado: boolean;
}

export interface ResultadoBuscaCandidatos {
  candidatos: CandidatoFornecedorListItem[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
}

function textoOpcional(valor: string | undefined): string | undefined {
  const t = valor?.trim();
  return t ? t : undefined;
}

function emailOuVazio(bruto: string | null): string {
  if (!bruto) return "";
  const parsed = z.string().email().safeParse(bruto.trim());
  return parsed.success ? parsed.data : "";
}

function isViolacaoUnica(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

const MENSAGEM_FILTRO_OBRIGATORIO =
  "Informe município, categoria ou CNPJ. A base tem milhões de empresas — busca sem filtro é recusada.";

/**
 * Busca candidatos a Fornecedor na base CNPJ/SP (M27). Recusa filtro vazio de
 * propósito: um `findMany` sem `where`/`take` nesta tabela derruba o Postgres.
 * Filtros usam os índices existentes (`[estado, municipio]` e GIN em
 * `categoriaSugerida`). Não busca por nome — limitação estrutural dos dados
 * abertos da Receita, não de ferramenta.
 */
export async function buscarCandidatosFornecedor(filtros: {
  municipio?: string;
  categoria?: string;
  cnpj?: string;
  pagina?: number;
}): Promise<ActionResult<ResultadoBuscaCandidatos>> {
  await requireAuth();

  const municipio = textoOpcional(filtros.municipio);
  const categoria = textoOpcional(filtros.categoria);
  const cnpjDigitos = textoOpcional(filtros.cnpj)?.replace(/\D/g, "");
  const pagina = Math.min(Math.max(1, filtros.pagina ?? 1), PAGINA_MAXIMA);

  if (!municipio && !categoria && !cnpjDigitos) {
    return { error: MENSAGEM_FILTRO_OBRIGATORIO };
  }

  if (cnpjDigitos) {
    if (cnpjDigitos.length !== 14) {
      return { error: "CNPJ inválido (informe 14 dígitos)" };
    }
    const encontrado = await db.empresaCandidataFornecedor.findUnique({
      where: { cnpj: cnpjDigitos },
      select: SELECT_CANDIDATO,
    });
    const candidatos = encontrado ? await marcarJaCadastrados([encontrado]) : [];
    return {
      data: {
        candidatos,
        total: candidatos.length,
        pagina: 1,
        tamanhoPagina: TAMANHO_PAGINA_CANDIDATOS,
      },
    };
  }

  const where = {
    estado: "SP",
    ...(municipio ? { municipio: normalizarMunicipio(municipio) } : {}),
    ...(categoria ? { categoriaSugerida: { has: categoria } } : {}),
  };

  const [linhas, total] = await Promise.all([
    db.empresaCandidataFornecedor.findMany({
      where,
      select: SELECT_CANDIDATO,
      orderBy: { razaoSocial: "asc" },
      take: TAMANHO_PAGINA_CANDIDATOS,
      skip: (pagina - 1) * TAMANHO_PAGINA_CANDIDATOS,
    }),
    db.empresaCandidataFornecedor.count({ where }),
  ]);

  return {
    data: {
      candidatos: await marcarJaCadastrados(linhas),
      total,
      pagina,
      tamanhoPagina: TAMANHO_PAGINA_CANDIDATOS,
    },
  };
}

type CandidatoSelect = {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  municipio: string;
  estado: string;
  cnaePrincipalCodigo: string;
  cnaePrincipalDescricao: string;
  categoriaSugerida: string[];
  email: string | null;
  telefone: string | null;
};

async function marcarJaCadastrados(
  linhas: CandidatoSelect[],
): Promise<CandidatoFornecedorListItem[]> {
  const mascarados = linhas.map((c) => formatarCnpj(c.cnpj)).filter((c): c is string => c !== null);

  const existentes =
    mascarados.length === 0
      ? []
      : await db.fornecedor.findMany({
          where: { cnpj: { in: mascarados } },
          select: { cnpj: true },
        });
  const cadastrados = new Set(existentes.map((f) => f.cnpj));

  return linhas.map((c) => {
    const cnpjMascarado = formatarCnpj(c.cnpj) ?? c.cnpj;
    return {
      ...c,
      cnpjMascarado,
      jaCadastrado: cadastrados.has(cnpjMascarado),
    };
  });
}

const promoverSchema = z.object({
  candidatoId: z.string().cuid(),
  categoria: z.array(z.string().trim().min(1)).min(1).optional(),
});

/**
 * Copia um `EmpresaCandidataFornecedor` para o cadastro vivo de `Fornecedor`.
 * E-mail/responsável podem ficar vazios: o M26 preenche contato a partir do
 * CNPJ depois. Categoria não — sem ela o fornecedor some da busca por camada.
 *
 * Unicidade é atômica no `create` (`cnpj` @unique): corrida devolve "já
 * cadastrado" via P2002, sem check-antes-de-escrever (CLAUDE.md §9.14).
 */
export async function promoverCandidatoFornecedor(
  input: unknown,
): Promise<ActionResult<{ fornecedorId: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = promoverSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const candidato = await db.empresaCandidataFornecedor.findUnique({
    where: { id: parsed.data.candidatoId },
    select: SELECT_CANDIDATO,
  });
  if (!candidato) return { error: "Candidato não encontrado" };

  const categoria = parsed.data.categoria ?? candidato.categoriaSugerida;
  if (categoria.length === 0) {
    return { error: "Informe ao menos uma categoria para promover este candidato" };
  }

  const cnpj = formatarCnpj(candidato.cnpj);
  if (!cnpj) return { error: "CNPJ do candidato é inválido" };

  try {
    const fornecedor = await db.fornecedor.create({
      data: {
        cnpj,
        razaoSocial: candidato.razaoSocial,
        nomeFantasia: candidato.nomeFantasia ?? undefined,
        categoria,
        cidade: candidato.municipio,
        estado: candidato.estado,
        email: emailOuVazio(candidato.email),
        telefone: candidato.telefone ?? undefined,
      },
      select: { id: true },
    });

    await registrarAuditoria({
      userId: user.id,
      acao: "promover_candidato_fornecedor",
      detalhes: { candidatoId: candidato.id, fornecedorId: fornecedor.id, cnpj },
    });
    revalidatePath("/fornecedores");
    revalidatePath("/fornecedores/candidatos");

    return { data: { fornecedorId: fornecedor.id } };
  } catch (erro) {
    if (isViolacaoUnica(erro)) return { error: "CNPJ já cadastrado" };
    throw erro;
  }
}

/** Vocabulário de tags reais do cadastro — a IA da etapa 4 só escolhe dentre estas. */
export async function listarCategoriasFornecedor(): Promise<string[]> {
  await requireAuth();
  const ativos = await db.fornecedor.findMany({
    where: { status: "ativo" },
    select: { categoria: true },
  });
  return [...new Set(ativos.flatMap((f) => f.categoria))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}
