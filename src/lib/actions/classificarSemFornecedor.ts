"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { classificarSemFornecedorEmLote } from "@/lib/emailCotacao/classificarSemFornecedor";
import type { ActionResult } from "./processos";

/**
 * Coloca cada resposta sem fornecedor ligado na categoria que a IA leu (recusa, orçamento ou
 * dúvida, confiança alta) e a conta no dashboard (M30.d). Não recebe ids do cliente; nenhuma
 * consulta é alterada. Auditoria: contagem e ids internos da fila, nenhum endereço nem texto.
 */
export async function classificarSemFornecedorPelaIa(): Promise<ActionResult<{ classificadas: number }>> {
  const user = await requireRole("pesquisa");
  const { feitas } = await classificarSemFornecedorEmLote();
  if (feitas.length > 0) {
    await registrarAuditoria({
      userId: user.id,
      acao: "classificar_sem_fornecedor_lote",
      detalhes: { classificadas: feitas.length, pendenteIds: feitas.map((f) => f.pendenteId) },
    });
    revalidatePath("/cotacoes");
    revalidatePath("/dashboard");
  }
  return { data: { classificadas: feitas.length } };
}
