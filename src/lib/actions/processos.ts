"use server";

import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
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

  const processo = await db.processo.findUnique({ where: { id: processoId } });
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

export async function aprovarProcesso(processoId: string): Promise<ActionResult> {
  const user = await requireRole("aprovacao");

  const processo = await db.processo.findUnique({ where: { id: processoId } });
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

export async function listarAuditLogs(processoId: string) {
  await requireAuth();

  return db.auditLog.findMany({
    where: { processoId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, role: true } } },
  });
}
