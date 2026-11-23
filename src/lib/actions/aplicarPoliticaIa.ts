"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { aplicarPoliticaIa as aplicar, type ResultadoPolitica } from "@/lib/emailCotacao/politicaIa";
import type { ActionResult } from "./processos";

/**
 * Fecha as respostas pendentes pela política da IA (M30.d): recusa e dúvida pela leitura da IA; nunca
 * orçamento nem "não é resposta"; nunca por cima de consulta já decidida. Cada decisão
 * entra na auditoria e pode ser desfeita na aba "Aplicadas pela IA". Cada clique trata até 100.
 */
export async function aplicarPoliticaIa(): Promise<ActionResult<ResultadoPolitica>> {
  const user = await requireRole("pesquisa");
  const r = await aplicar(user.id);
  if (r.desligada) return { error: "A aplicação automática da IA está desligada." };
  revalidatePath("/cotacoes");
  revalidatePath("/dashboard");
  return { data: r };
}
