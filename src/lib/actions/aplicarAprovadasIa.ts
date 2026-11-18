"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { aplicacaoIaLigada, aplicarAprovadasPendentes, type BackfillResultado } from "@/lib/emailCotacao/aplicarIa";
import type { ActionResult } from "./processos";

/**
 * Aplica o acervo que o critério da IA já aprovou em modo sombra (M30.d). Só com a chave ligada.
 * Cada clique processa até `MAX_APLICACOES_POR_CLIQUE`; o retorno diz quantas restam.
 */
export async function aplicarAprovadasPelaIa(): Promise<ActionResult<BackfillResultado>> {
  const user = await requireRole("pesquisa");
  if (!aplicacaoIaLigada()) return { error: "A aplicação automática da IA está desligada." };
  const r = await aplicarAprovadasPendentes(user.id);
  revalidatePath("/cotacoes");
  revalidatePath("/dashboard");
  return { data: r };
}
