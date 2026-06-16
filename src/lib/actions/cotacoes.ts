"use server";

import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import {
  createCotacaoSchema,
  updateCotacaoSchema,
  createPropostaSchema,
} from "@/lib/validations/cotacao";
import { validarProposta } from "@/lib/domain/proposalValidator";
import type { ActionResult } from "./processos";

export async function criarCotacao(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createCotacaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const cotacao = await db.cotacao.create({
    data: { ...parsed.data, status: "silenciosa" },
  });

  await registrarAuditoria({
    userId: user.id,
    processoId: parsed.data.processoId,
    cotacaoId: cotacao.id,
    acao: "criar_cotacao",
    detalhes: { cotacaoId: cotacao.id, fornecedorId: parsed.data.fornecedorId },
  });

  return { data: { id: cotacao.id } };
}

export async function atualizarCotacao(
  cotacaoId: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireRole("pesquisa");
  const parsed = updateCotacaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const cotacao = await db.cotacao.findUnique({ where: { id: cotacaoId } });
  if (!cotacao) return { error: "Cotação não encontrada" };

  await db.cotacao.update({ where: { id: cotacaoId }, data: parsed.data });

  await registrarAuditoria({
    userId: user.id,
    processoId: cotacao.processoId,
    cotacaoId,
    acao: "atualizar_cotacao",
    detalhes: { cotacaoId, statusNovo: parsed.data.status },
  });

  return {};
}

export async function registrarProposta(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createPropostaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const cotacao = await db.cotacao.findUnique({ where: { id: parsed.data.cotacaoId } });
  if (!cotacao) return { error: "Cotação não encontrada" };

  const validacao = validarProposta(
    {
      cnpj: parsed.data.cnpjValido !== "invalido" ? "present" : undefined,
      descricaoObjeto: parsed.data.descricaoValida !== "invalido" ? "present" : undefined,
      valorUnitario: parsed.data.valorUnitario,
      valorTotal: parsed.data.valorTotal,
      dataEmissao: parsed.data.dataProposta,
      nomeResponsavel: parsed.data.responsavel,
    },
    new Date(),
  );

  const blockViolations = validacao.violations.filter((v) => v.severity === "block");
  if (blockViolations.length > 0) {
    return { error: blockViolations[0]!.rule };
  }

  const proposta = await db.proposta.create({ data: parsed.data });

  await registrarAuditoria({
    userId: user.id,
    processoId: cotacao.processoId,
    cotacaoId: parsed.data.cotacaoId,
    acao: "registrar_proposta",
    detalhes: { propostaId: proposta.id, statusGeral: parsed.data.statusGeral },
  });

  return { data: { id: proposta.id } };
}

export async function listarCotacoesPorProcesso(processoId: string) {
  await requireAuth();
  return db.cotacao.findMany({
    where: { processoId },
    include: {
      fornecedor: { select: { razaoSocial: true, cnpj: true } },
      proposta: true,
    },
    orderBy: { dataEnvio: "desc" },
  });
}

export async function listarCotacoes(filtros?: {
  processoId?: string;
  status?: string;
  fornecedorId?: string;
}) {
  await requireAuth();
  return db.cotacao.findMany({
    where: {
      ...(filtros?.processoId ? { processoId: filtros.processoId } : {}),
      ...(filtros?.status ? { status: filtros.status as never } : {}),
      ...(filtros?.fornecedorId ? { fornecedorId: filtros.fornecedorId } : {}),
    },
    include: {
      fornecedor: { select: { razaoSocial: true, cnpj: true, email: true } },
      processo: { select: { numero: true, objeto: true } },
      proposta: true,
    },
    orderBy: { dataEnvio: "desc" },
  });
}
