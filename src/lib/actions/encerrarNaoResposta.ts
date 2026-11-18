"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { encerrarNaoRespostaEmLote } from "@/lib/emailCotacao/encerrarNaoResposta";
import type { ActionResult } from "./processos";

/**
 * Encerra de uma vez as respostas sem fornecedor ligado que a IA leu, com confiança alta, como
 * "não é resposta" (M30.d). Não recebe ids do cliente. A auditoria guarda só a contagem e os ids
 * internos da fila — nenhum endereço nem texto.
 */
export async function encerrarNaoRespostaSemFornecedor(): Promise<ActionResult<{ encerradas: number }>> {
  const user = await requireRole("pesquisa");
  const { ids, encerradas } = await encerrarNaoRespostaEmLote();
  if (encerradas > 0) {
    await registrarAuditoria({
      userId: user.id,
      acao: "encerrar_nao_resposta_lote",
      detalhes: { encerradas, pendenteIds: ids },
    });
    revalidatePath("/cotacoes");
  }
  return { data: { encerradas } };
}
