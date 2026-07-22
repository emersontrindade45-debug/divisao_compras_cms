"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import type { ActionResult } from "./processos";

const registrarAderenciaSchema = z
  .object({
    aderencia: z.enum(["aderente", "parcial", "nao_aderente"]),
    justificativa: z.string().optional(),
  })
  .refine(
    (d) => d.aderencia === "aderente" || (d.justificativa && d.justificativa.trim().length > 0),
    { message: "Justificativa obrigatória para aderência parcial ou não aderente" },
  );

export async function listarContratacoes(filtros?: { processoId?: string }) {
  await requireAuth();
  return db.contratacaoPublica.findMany({
    where: filtros?.processoId ? { processoId: filtros.processoId } : {},
    include: { processo: { select: { numero: true, objeto: true } } },
    orderBy: { dataContratacao: "desc" },
  });
}

export async function registrarAderencia(
  contratacaoId: string,
  input: z.infer<typeof registrarAderenciaSchema>,
): Promise<ActionResult> {
  const user = await requireRole("pesquisa");
  const parsed = registrarAderenciaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const contratacao = await db.contratacaoPublica.findUnique({ where: { id: contratacaoId } });
  if (!contratacao) return { error: "Contratação não encontrada" };

  await db.contratacaoPublica.update({
    where: { id: contratacaoId },
    data: {
      aderencia: parsed.data.aderencia,
      justificativaAderencia: parsed.data.justificativa?.trim() || null,
    },
  });

  await registrarAuditoria({
    userId: user.id,
    processoId: contratacao.processoId,
    acao: "registrar_aderencia_contratacao",
    detalhes: { contratacaoId, aderencia: parsed.data.aderencia },
  });

  revalidatePath("/contratacoes");
  revalidatePath(`/processos/${contratacao.processoId}`);

  return {};
}
