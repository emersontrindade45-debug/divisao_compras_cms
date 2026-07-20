"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import type { ActionResult } from "./processos";

export async function salvarPalavrasChaveItem(
  itemId: string,
  palavrasChave: string[],
): Promise<ActionResult> {
  const user = await requireAuth();

  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { id: true, processoId: true },
  });
  if (!item) return { error: "Item não encontrado." };

  const termos = palavrasChave
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  await db.item.update({
    where: { id: itemId },
    data: { palavrasChave: termos },
  });

  await registrarAuditoria({
    userId: user.id,
    processoId: item.processoId,
    acao: "salvar_palavras_chave_item",
    detalhes: { itemId, palavrasChave: termos },
  });

  revalidatePath(`/processos/${item.processoId}`);

  return {};
}
