"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import type { ActionResult } from "./processos";

const naturezaSchema = z.enum(["bem_consumo", "servico_continuo"]);

const atualizarNaturezaSchema = z.object({
  itemId: z.string().cuid(),
  // `null` limpa a classificação (item volta a usar o teto de 730 dias — ver in65Rules.ts).
  natureza: naturezaSchema.nullable(),
});

/**
 * Classifica um item como bem de consumo ou serviço contínuo — determina a
 * janela de validade (12 ou 18 meses) de uma contratação pública homologada
 * usada como referência de preço para este item (CLAUDE.md §9, in65Rules.ts).
 */
export async function atualizarNaturezaItem(
  itemId: string,
  natureza: "bem_consumo" | "servico_continuo" | null,
): Promise<ActionResult<{ itemId: string }>> {
  const user = await requireRole("pesquisa");

  const parsed = atualizarNaturezaSchema.safeParse({ itemId, natureza });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const item = await db.item.findUnique({
    where: { id: parsed.data.itemId },
    select: { id: true, processoId: true, natureza: true },
  });
  if (!item) return { error: "Item não encontrado" };

  await db.item.update({
    where: { id: item.id },
    data: { natureza: parsed.data.natureza },
  });

  await registrarAuditoria({
    userId: user.id,
    processoId: item.processoId,
    acao: "atualizar_natureza_item",
    detalhes: { itemId: item.id, de: item.natureza, para: parsed.data.natureza },
  });

  revalidatePath(`/processos/${item.processoId}`);

  return { data: { itemId: item.id } };
}
