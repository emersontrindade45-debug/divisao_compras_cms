"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { FASES_ANDAMENTO } from "@/lib/domain/faseAndamento";
import { z } from "zod";

const atualizarStatusSchema = z.object({
  processoId: z.string().cuid(),
  status: z.enum(["aderente", "parcial", "nao_aderente", "pendente"]),
  justificativa: z.string().min(10, "Justificativa obrigatória (mín. 10 caracteres)"),
});

export interface ActionResult<T = void> {
  data?: T;
  error?: string;
}

export async function atualizarStatusProcesso(
  input: z.infer<typeof atualizarStatusSchema>
): Promise<ActionResult> {
  const user = await requireRole("revisao");

  const parsed = atualizarStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { processoId, status, justificativa } = parsed.data;

  const processo = await db.processo.findUnique({
    where: { id: processoId },
    select: { id: true, status: true },
  });
  if (!processo) return { error: "Processo não encontrado" };

  await db.processo.update({
    where: { id: processoId },
    data: { status },
  });

  await registrarAuditoria({
    userId: user.id,
    acao: "atualizar_status_processo",
    processoId,
    detalhes: { statusAnterior: processo.status, statusNovo: status, justificativa },
  });

  return {};
}

const atualizarFaseAndamentoSchema = z.object({
  processoId: z.string().cuid(),
  faseAndamento: z.enum(FASES_ANDAMENTO as [string, ...string[]]),
});

// Fase de andamento é tag operacional, não decisão de conformidade — por
// isso não exige a justificativa nem o papel "revisao" que
// `atualizarStatusProcesso` exige para a aderência IN 65/2021.
export async function atualizarFaseAndamentoProcesso(
  processoId: string,
  faseAndamento: string,
): Promise<ActionResult<{ processoId: string }>> {
  const user = await requireRole("pesquisa");

  const parsed = atualizarFaseAndamentoSchema.safeParse({ processoId, faseAndamento });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const processo = await db.processo.findUnique({
    where: { id: parsed.data.processoId },
    select: { id: true, faseAndamento: true },
  });
  if (!processo) return { error: "Processo não encontrado" };

  await db.processo.update({
    where: { id: processo.id },
    data: { faseAndamento: parsed.data.faseAndamento as typeof FASES_ANDAMENTO[number] },
  });

  await registrarAuditoria({
    userId: user.id,
    acao: "atualizar_fase_andamento_processo",
    processoId: processo.id,
    detalhes: { de: processo.faseAndamento, para: parsed.data.faseAndamento },
  });

  revalidatePath("/processos");
  revalidatePath(`/processos/${processo.id}`);

  return { data: { processoId: processo.id } };
}

export async function aprovarProcesso(processoId: string): Promise<ActionResult> {
  const user = await requireRole("aprovacao");

  const processo = await db.processo.findUnique({
    where: { id: processoId },
    select: { id: true, status: true },
  });
  if (!processo) return { error: "Processo não encontrado" };

  await db.processo.update({
    where: { id: processoId },
    data: { status: "aderente" },
  });

  await registrarAuditoria({
    userId: user.id,
    acao: "aprovar_processo",
    processoId,
    detalhes: { statusAnterior: processo.status },
  });

  return {};
}

export async function excluirProcesso(processoId: string): Promise<ActionResult> {
  const user = await requireRole("aprovacao");

  const processo = await db.processo.findUnique({
    where: { id: processoId },
    select: { id: true, numero: true, objeto: true },
  });
  if (!processo) return { error: "Processo não encontrado." };

  await registrarAuditoria({
    userId: user.id,
    acao: "excluir_processo",
    processoId,
    detalhes: { numero: processo.numero, objeto: processo.objeto },
  });

  // Cascade definido no schema: itens, fontes, evidências, cotações e série de
  // preços são removidos em cascata pelo banco.
  await db.processo.delete({ where: { id: processoId } });

  return {};
}

export async function listarAuditLogs(processoId: string) {
  await requireAuth();

  return db.auditLog.findMany({
    where: { processoId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, role: true } } },
  });
}
