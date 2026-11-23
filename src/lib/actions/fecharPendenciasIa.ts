"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { executarFechamento, type ResultadoFechamento } from "@/lib/emailCotacao/fechamentoIa";
import type { ActionResult } from "./processos";

/**
 * Fecha as pendências (M30.d): aplica as sugestões da IA nas consultas ainda abertas, encerra a entrada
 * da fila das que já têm decisão (sem alterar a consulta) e dispensa as de out a dez/2025 sem leitura
 * da IA. Nada é apagado; a auditoria guarda cada id.
 */
export async function fecharPendenciasIa(): Promise<ActionResult<ResultadoFechamento>> {
  const user = await requireRole("pesquisa");
  const r = await executarFechamento(user.id);
  revalidatePath("/cotacoes");
  revalidatePath("/dashboard");
  return { data: r };
}
