"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import type { ActionResult } from "./processos";

const descartarSchema = z.object({
  resultadoId: z.string().cuid(),
});

/**
 * Remove um candidato de contratação pública similar
 * (`ResultadoSimilaridade`) da lista exibida ao usuário, sem apagar o
 * registro (mantém rastreabilidade — CLAUDE.md §1). O candidato reaparece se
 * uma nova busca por similaridade recriar as linhas do item.
 */
export async function descartarResultadoSimilaridade(
  resultadoId: string,
): Promise<ActionResult<{ resultadoId: string }>> {
  const user = await requireRole("pesquisa");

  const parsed = descartarSchema.safeParse({ resultadoId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  // `select` explícito: mesma razão de promoverFonte.ts (CLAUDE.md §9.46) —
  // colunas novas do schema podem não existir ainda no banco em produção.
  const resultado = await db.resultadoSimilaridade.findUnique({
    where: { id: parsed.data.resultadoId },
    select: {
      id: true,
      promovidoParaFonte: true,
      descartado: true,
      item: { select: { id: true, processoId: true } },
    },
  });

  if (!resultado) return { error: "Candidato não encontrado" };
  if (resultado.promovidoParaFonte) {
    return { error: "Candidato já promovido para Fonte não pode ser descartado" };
  }
  if (resultado.descartado) return { data: { resultadoId: resultado.id } };

  // Guarda atômica: só marca se ainda não foi promovido/descartado por outra
  // requisição concorrente (mesmo padrão de promoverFonte.ts).
  const marcado = await db.resultadoSimilaridade.updateMany({
    where: { id: resultado.id, promovidoParaFonte: false, descartado: false },
    data: { descartado: true },
  });
  if (marcado.count === 0) {
    return { error: "Não foi possível descartar: candidato já promovido ou já descartado" };
  }

  await registrarAuditoria({
    userId: user.id,
    processoId: resultado.item.processoId,
    acao: "descartar_resultado_similaridade",
    detalhes: { resultadoId: resultado.id, itemId: resultado.item.id },
  });

  revalidatePath(`/processos/${resultado.item.processoId}`);

  return { data: { resultadoId: resultado.id } };
}
