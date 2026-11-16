"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { FASES_ANDAMENTO } from "@/lib/domain/faseAndamento";
import { MOTIVOS_CORRECAO, ehFalhaDocumental } from "@/lib/domain/motivosCorrecao";
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

  revalidatePath("/dashboard");
  revalidatePath("/processos");
  revalidatePath(`/processos/${processoId}`);

  return {};
}

const motivoCorrecaoSchema = z
  .object({
    codigo: z.enum(MOTIVOS_CORRECAO),
    texto: z.string().trim().max(500).optional(),
  })
  .refine((m) => m.codigo !== "outro" || (m.texto?.length ?? 0) >= 5, {
    message: "Descreva o motivo da correção (mín. 5 caracteres)",
  });

const atualizarFaseAndamentoSchema = z
  .object({
    processoId: z.string().cuid(),
    faseAndamento: z.enum(FASES_ANDAMENTO as [string, ...string[]]),
    motivo: motivoCorrecaoSchema.optional(),
  })
  // M30.0: ir para "em correção" é retrabalho, e o indicador do PRD precisa
  // separar falha documental das demais causas — sem motivo, não há como.
  .refine((d) => d.faseAndamento !== "em_correcao" || d.motivo !== undefined, {
    message: "Informe o motivo da correção",
  });

export type MotivoCorrecaoInput = z.infer<typeof motivoCorrecaoSchema>;

// Fase de andamento é tag operacional, não decisão de conformidade — por
// isso não exige a justificativa nem o papel "revisao" que
// `atualizarStatusProcesso` exige para a aderência IN 65/2021.
export async function atualizarFaseAndamentoProcesso(
  processoId: string,
  faseAndamento: string,
  motivo?: MotivoCorrecaoInput,
): Promise<ActionResult<{ processoId: string }>> {
  const user = await requireRole("pesquisa");

  const parsed = atualizarFaseAndamentoSchema.safeParse({ processoId, faseAndamento, motivo });
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
    detalhes: {
      de: processo.faseAndamento,
      para: parsed.data.faseAndamento,
      // Só na ida para "em correção" (o schema exige o motivo ali).
      ...(parsed.data.faseAndamento === "em_correcao" && parsed.data.motivo
        ? {
            motivo: parsed.data.motivo.codigo,
            motivoTexto: parsed.data.motivo.texto ?? null,
            falhaDocumental: ehFalhaDocumental(parsed.data.motivo.codigo),
          }
        : {}),
    },
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
