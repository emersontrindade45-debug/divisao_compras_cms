"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { desfazerAplicacaoIa } from "@/lib/emailCotacao/aplicarIa";
import type { ActionResult } from "./processos";

const schema = z.object({ gmailMensagemId: z.string().min(1).max(64) });

/**
 * Desfaz uma classificação que a IA aplicou sozinha (M30.d, Fase 3b): a resposta volta à fila
 * "Respostas a confirmar" e a consulta volta ao que era. Só mexe na consulta se ela ainda é o
 * resultado dessa aplicação; uma decisão mais nova (do analista ou de outra resposta) é preservada.
 * A auditoria guarda só o id da mensagem — nenhum endereço nem texto.
 */
export async function desfazerRespostaAplicadaPelaIa(input: unknown): Promise<ActionResult<{ desfeita: boolean }>> {
  const user = await requireRole("pesquisa");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const r = await desfazerAplicacaoIa(parsed.data.gmailMensagemId);
  if (r === "nada_a_desfazer") return { error: "Esta aplicação já foi desfeita ou não existe." };

  await registrarAuditoria({
    userId: user.id,
    acao: "ia_desfazer_resposta_email",
    detalhes: { gmailMensagemId: parsed.data.gmailMensagemId },
  });
  revalidatePath("/cotacoes");
  revalidatePath("/dashboard");
  return { data: { desfeita: true } };
}
