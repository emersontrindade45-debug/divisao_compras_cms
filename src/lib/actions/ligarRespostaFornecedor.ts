"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import {
  buscarCandidatosDoEnvio,
  ligarRespostaAConsulta,
  type CandidatoConsulta,
} from "@/lib/emailCotacao/ligarRespostaFornecedor";
import type { ActionResult } from "./processos";

const idMensagem = z.string().min(1).max(64);

const buscarSchema = z.object({
  gmailMensagemId: idMensagem,
  termo: z.string().max(100).default(""),
});

const ligarSchema = z.object({
  gmailMensagemId: idMensagem,
  consultaId: z.string().cuid(),
});

/**
 * Candidatos a "quem respondeu" (ligação rápida, M30.d): as consultas do envio da resposta. O envio
 * é descoberto pelo servidor a partir da mensagem — o cliente não escolhe em qual envio procurar.
 */
export async function buscarFornecedoresDoEnvio(input: unknown): Promise<ActionResult<CandidatoConsulta[]>> {
  await requireRole("pesquisa");
  const parsed = buscarSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };
  const candidatos = await buscarCandidatosDoEnvio(parsed.data.gmailMensagemId, parsed.data.termo);
  if (candidatos === null) return { error: "Resposta não encontrada." };
  return { data: candidatos };
}

export interface LigacaoFeita {
  /** A situação do fornecedor foi alterada (era aberta). Falso = já tinha decisão e foi mantida. */
  aplicada: boolean;
  situacao: string;
}

/**
 * Liga uma resposta classificada pela IA ao fornecedor escolhido pelo analista. Para desfazer, vale o
 * "Desfazer" da aba "Aplicadas pela IA". A auditoria guarda só ids e classe — nenhum endereço.
 */
export async function ligarRespostaAoFornecedor(input: unknown): Promise<ActionResult<LigacaoFeita>> {
  const user = await requireRole("pesquisa");
  const parsed = ligarSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };
  const { gmailMensagemId, consultaId } = parsed.data;

  const r = await ligarRespostaAConsulta(gmailMensagemId, consultaId);
  if (r.tipo === "erro") return { error: r.mensagem };

  await registrarAuditoria({
    userId: user.id,
    acao: "ligar_resposta_fornecedor",
    detalhes: { gmailMensagemId, consultaId, aplicada: r.aplicada, situacao: r.situacao },
  });
  revalidatePath("/cotacoes");
  revalidatePath("/dashboard");
  return { data: { aplicada: r.aplicada, situacao: r.situacao } };
}
