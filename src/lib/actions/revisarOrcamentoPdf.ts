"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import type { ActionResult } from "./processos";

import { REGRAS_ORCAMENTO_POR_ANEXO } from "@/lib/domain/cotacaoEmail/regrasOrcamentoPorAnexo";

const schema = z.object({
  consultaId: z.string().cuid(),
  decisao: z.enum(["rebaixar", "manter"]),
});

export type ResultadoRevisao = { situacao: "orcamento" | "recusa" | "duvida" | "sem_resposta" };

/**
 * Revisão de uma consulta marcada "orçamento" só por ter anexo (M30.d). O analista ou mantém o
 * orçamento (vira decisão manual, sai da lista) ou aceita o veredito da IA. A classe da IA é lida
 * do BANCO, nunca do cliente: o clique não pode inventar um desfecho.
 *
 * Atômica (§9.14): `updateMany` com situação, regra e mensagem esperadas no `where`; se outra
 * decisão chegou antes, nada é sobrescrito. A auditoria guarda só ids e classes.
 */
export async function revisarOrcamentoPorPdf(input: unknown): Promise<ActionResult<ResultadoRevisao>> {
  const user = await requireRole("pesquisa");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };
  const { consultaId, decisao } = parsed.data;

  const consulta = await db.consultaCotacao.findUnique({
    where: { id: consultaId },
    select: { situacao: true, regra: true, gmailRespostaId: true },
  });
  const JA_REVISADA = "Esta consulta já foi revisada ou mudou de situação.";
  if (
    !consulta ||
    consulta.situacao !== "orcamento" ||
    !consulta.gmailRespostaId ||
    !REGRAS_ORCAMENTO_POR_ANEXO.includes(consulta.regra as (typeof REGRAS_ORCAMENTO_POR_ANEXO)[number])
  ) {
    return { error: JA_REVISADA };
  }
  const guarda = {
    id: consultaId,
    situacao: "orcamento" as const,
    regra: { in: [...REGRAS_ORCAMENTO_POR_ANEXO] },
    gmailRespostaId: consulta.gmailRespostaId,
  };

  if (decisao === "manter") {
    const r = await db.consultaCotacao.updateMany({ where: guarda, data: { regra: "manual" } });
    if (r.count === 0) return { error: JA_REVISADA };
    await registrarAuditoria({
      userId: user.id,
      acao: "revisar_orcamento_pdf",
      detalhes: { consultaId, decisao, situacao: "orcamento" },
    });
    revalidatePath("/cotacoes");
    return { data: { situacao: "orcamento" } };
  }

  const ia = await db.classificacaoIaResposta.findUnique({
    where: { gmailMensagemId: consulta.gmailRespostaId },
    select: { classeIa: true },
  });
  if (!ia || ia.classeIa === "orcamento") return { error: "A IA não discorda desta consulta." };

  const nova = ia.classeIa === "recusa" || ia.classeIa === "duvida" ? ia.classeIa : "sem_resposta";
  const r = await db.consultaCotacao.updateMany({
    where: guarda,
    data:
      nova === "sem_resposta"
        ? { situacao: "sem_resposta", dataResposta: null, gmailRespostaId: null, regra: null }
        : { situacao: nova, regra: "manual" },
  });
  if (r.count === 0) return { error: JA_REVISADA };

  await registrarAuditoria({
    userId: user.id,
    acao: "revisar_orcamento_pdf",
    detalhes: { consultaId, decisao, situacao: nova, classeIa: ia.classeIa },
  });
  revalidatePath("/cotacoes");
  revalidatePath("/dashboard");
  return { data: { situacao: nova } };
}
