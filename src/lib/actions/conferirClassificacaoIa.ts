"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { registrarConferencia } from "@/lib/emailCotacao/conferenciaIa";
import { CLASSES } from "@/lib/domain/cotacaoEmail/conferenciaIa";
import type { ActionResult } from "./processos";

const schema = z.object({
  gmailMensagemId: z.string().min(1).max(64),
  classeCorreta: z.enum(CLASSES as unknown as [string, ...string[]]),
});

export interface ConferenciaFeita {
  certa: boolean;
  classeIa: string;
}

/**
 * Registra qual era a classe certa de uma resposta que a IA classificou (M30.d). Só mede: não muda
 * consulta, fila nem dashboard. A auditoria guarda ids e classes — nenhum texto de e-mail.
 */
export async function conferirClassificacaoIa(input: unknown): Promise<ActionResult<ConferenciaFeita>> {
  const user = await requireRole("pesquisa");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };
  const { gmailMensagemId, classeCorreta } = parsed.data;

  let r;
  try {
    r = await registrarConferencia(gmailMensagemId, classeCorreta as (typeof CLASSES)[number], user.id);
  } catch {
    return { error: "Não foi possível gravar a conferência agora. Tente de novo." };
  }
  if (r.tipo === "erro") return { error: r.mensagem };

  await registrarAuditoria({
    userId: user.id,
    acao: "conferir_classificacao_ia",
    detalhes: { gmailMensagemId, classeIa: r.classeIa, classeCorreta, certa: r.certa },
  });
  revalidatePath("/cotacoes");
  return { data: { certa: r.certa, classeIa: r.classeIa } };
}
