"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { apagarTodosOsExemplos, coletarExemplos, type ResultadoColeta } from "@/lib/emailCotacao/exemplosIa";
import type { ActionResult } from "./processos";

/**
 * Busca os casos que a Divisão decidiu ou conferiu e guarda o trecho ANONIMIZADO como exemplo para a
 * 1ª leitura da IA (M30.d). Só decisão humana. A auditoria guarda contagens e nomes de regra — nunca
 * texto de e-mail. Quem usa os exemplos é a chave `IA_EXEMPLOS`, que continua desligada.
 */
export async function coletarExemplosIa(): Promise<ActionResult<ResultadoColeta>> {
  const user = await requireRole("pesquisa");
  const r = await coletarExemplos();
  if (!r.ok) return { error: r.erro };
  await registrarAuditoria({
    userId: user.id,
    acao: "coletar_exemplos_ia",
    detalhes: { origem: "manual", ...r.resultado },
  });
  revalidatePath("/cotacoes");
  return { data: r.resultado };
}

/** Apaga todos os exemplos guardados: a IA volta a ler como lia antes. Só quem aprova (o papel mais alto). */
export async function apagarExemplosIa(): Promise<ActionResult<{ apagados: number }>> {
  const user = await requireRole("aprovacao");
  const apagados = await apagarTodosOsExemplos();
  await registrarAuditoria({ userId: user.id, acao: "apagar_exemplos_ia", detalhes: { apagados } });
  revalidatePath("/cotacoes");
  return { data: { apagados } };
}
