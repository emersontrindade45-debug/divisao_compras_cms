"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import type { ActionResult } from "./processos";

const schema = z.object({
  id: z.string().cuid(),
  desfecho: z.enum(["orcamento", "recusa", "duvida", "nao_e_resposta"]),
  /** E-mail ao qual a solicitação foi enviada. Obrigatório só quando o sistema não sugeriu o fornecedor. */
  emailConsulta: z.string().trim().toLowerCase().email().max(320).optional(),
});

export type DesfechoResposta = z.infer<typeof schema>["desfecho"];

export interface ResolucaoResultado {
  /** O fornecedor já estava classificado (por regra ou por outra resposta) e foi mantido. */
  consultaJaClassificada: boolean;
}

/**
 * Resolve uma resposta da fila "a confirmar" (M30.d): o analista diz se é orçamento, recusa, dúvida
 * ou se não é resposta de cotação. Só grava o desfecho — o VALOR do orçamento nunca entra na série por
 * aqui; a proposta segue pelo registro e checklist de validade.
 *
 * Atômica (CLAUDE.md §9.14): a fila é marcada como resolvida com `updateMany ... WHERE
 * resolvidaEm IS NULL` dentro da mesma transação do desfecho; dois cliques simultâneos não
 * resolvem a mesma resposta duas vezes. A auditoria guarda só ids — nenhum endereço.
 */
export async function resolverRespostaEmail(
  input: unknown,
): Promise<ActionResult<ResolucaoResultado>> {
  const user = await requireRole("pesquisa");

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };
  const { id, desfecho, emailConsulta } = parsed.data;

  const pendente = await db.respostaEmailPendente.findUnique({
    where: { id },
    select: {
      id: true,
      envioId: true,
      gmailMensagemId: true,
      dataResposta: true,
      sugestaoConsultaId: true,
      resolvidaEm: true,
    },
  });
  if (!pendente) return { error: "Resposta não encontrada." };
  if (pendente.resolvidaEm) return { error: "Esta resposta já foi resolvida." };

  // E-mail digitado vale mais que a sugestão: é a correção do analista a uma ligação por domínio.
  let consultaId = pendente.sugestaoConsultaId;
  if (desfecho !== "nao_e_resposta" && emailConsulta) {
    const c = await db.consultaCotacao.findUnique({
      where: { envioId_email: { envioId: pendente.envioId, email: emailConsulta } },
      select: { id: true },
    });
    if (!c) return { error: "Esse e-mail não está entre os fornecedores consultados neste envio." };
    consultaId = c.id;
  }
  if (desfecho !== "nao_e_resposta" && !consultaId) {
    return { error: "Informe o e-mail ao qual a solicitação foi enviada." };
  }

  const resultado = await db.$transaction(async (tx) => {
    const guarda = await tx.respostaEmailPendente.updateMany({
      where: { id, resolvidaEm: null },
      data: { resolvidaEm: new Date() },
    });
    if (guarda.count === 0) return null;

    if (desfecho === "nao_e_resposta") {
      // Se foi ESTA mensagem que deixou o fornecedor "a confirmar", ele volta a "sem resposta".
      if (pendente.sugestaoConsultaId) {
        await tx.consultaCotacao.updateMany({
          where: {
            id: pendente.sugestaoConsultaId,
            situacao: "a_confirmar",
            gmailRespostaId: pendente.gmailMensagemId,
          },
          data: { situacao: "sem_resposta", dataResposta: null, gmailRespostaId: null, regra: null },
        });
      }
      return { consultaJaClassificada: false };
    }

    const alterou = await tx.consultaCotacao.updateMany({
      // "duvida" entra na lista: orçamento ou recusa depois de uma pergunta é a resposta que vale.
      where: { id: consultaId!, situacao: { in: ["sem_resposta", "a_confirmar", "duvida"] } },
      data: { situacao: desfecho, regra: "manual", gmailRespostaId: pendente.gmailMensagemId },
    });
    await tx.consultaCotacao.updateMany({
      where: { id: consultaId!, dataResposta: null },
      data: { dataResposta: pendente.dataResposta },
    });
    return { consultaJaClassificada: alterou.count === 0 };
  });

  if (resultado === null) return { error: "Esta resposta já foi resolvida." };

  await registrarAuditoria({
    userId: user.id,
    acao: "resolver_resposta_email",
    detalhes: { pendenteId: id, consultaId: consultaId ?? null, desfecho },
  });

  revalidatePath("/cotacoes");
  revalidatePath("/dashboard");
  return { data: resultado };
}
