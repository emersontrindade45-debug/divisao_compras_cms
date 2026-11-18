import "server-only";
import { db } from "@/lib/db";
import type { ClasseResposta } from "@/lib/domain/cotacaoEmail/criterioIa";

/**
 * Aplicação, na consulta, do veredito que a IA deu a uma resposta de fornecedor (M30.d, Fase 3b), e
 * o "Desfazer" correspondente.
 *
 * SÓ roda com a chave `IA_APLICAR_AUTOMATICO=1` e só para o que passou no critério de
 * `criterioIa.ts` (duas leituras de modelos diferentes, citação verificada, sem contradição com a
 * regra de palavras). Faz o MESMO que o clique do analista em `resolverRespostaEmail` — mesmas
 * guardas de situação, mesma regra de precedência — e acrescenta o que o desfazer precisa: a
 * situação anterior e se a data de resposta foi preenchida.
 *
 * Atômica (CLAUDE.md §9.14): tudo numa transação; a linha de classificação e a fila são marcadas
 * com `updateMany ... WHERE <estado esperado>`, então duas execuções simultâneas, ou uma execução
 * depois de o analista já ter resolvido a resposta, não aplicam duas vezes nem por cima de decisão
 * humana. Nenhum texto de e-mail passa por aqui: só ids, classe e situação.
 */

export const REGRA_IA = "ia";

/** Chave de liga/desliga, lida a cada uso (não na importação). Ausente = desligada: nega (§9.45). */
export function aplicacaoIaLigada(): boolean {
  return process.env.IA_APLICAR_AUTOMATICO === "1";
}

export interface AplicacaoIa {
  gmailMensagemId: string;
  classe: ClasseResposta;
  consultaId: string;
  /** Hora do cabeçalho da resposta (não a da classificação). */
  dataResposta: Date;
}

export type ResultadoAplicacao = "aplicada" | "ja_tratada" | "ja_resolvida";

/** Situações em que uma resposta ainda pode definir a consulta (mesma lista do analista). */
const SITUACOES_ABERTAS = ["sem_resposta", "a_confirmar", "duvida"] as const;

class AbortarAplicacao extends Error {}

export async function aplicarClassificacaoIa(a: AplicacaoIa): Promise<ResultadoAplicacao> {
  try {
    return await db.$transaction(async (tx) => {
      // 1. Marca a linha como aplicada. Falhou = já foi aplicada, ou o analista desfez (e desfeita
      //    nunca é refeita: a decisão humana vale mais).
      const marca = await tx.classificacaoIaResposta.updateMany({
        where: { gmailMensagemId: a.gmailMensagemId, aplicadaEm: null, desfeitaEm: null },
        data: { aplicadaEm: new Date() },
      });
      if (marca.count === 0) return "ja_tratada" as const;

      // 2. A resposta ainda está aberta na fila? Se o analista já a resolveu, desfaz tudo e sai.
      const fila = await tx.respostaEmailPendente.updateMany({
        where: { gmailMensagemId: a.gmailMensagemId, resolvidaEm: null },
        data: { resolvidaEm: new Date() },
      });
      if (fila.count === 0) throw new AbortarAplicacao();

      const consulta = await tx.consultaCotacao.findUnique({
        where: { id: a.consultaId },
        select: { situacao: true, gmailRespostaId: true },
      });
      if (!consulta) throw new AbortarAplicacao();

      let dataRespostaDefinida = false;
      if (a.classe === "nao_e_resposta") {
        // Se foi ESTA mensagem que deixou o fornecedor "a confirmar", ele volta a "sem resposta".
        await tx.consultaCotacao.updateMany({
          where: { id: a.consultaId, situacao: "a_confirmar", gmailRespostaId: a.gmailMensagemId },
          data: { situacao: "sem_resposta", dataResposta: null, gmailRespostaId: null, regra: null },
        });
      } else {
        // Orçamento/recusa/dúvida só definem uma consulta ainda aberta: uma decisão anterior (de
        // regra, de outra resposta ou do analista) nunca é sobrescrita.
        await tx.consultaCotacao.updateMany({
          where: { id: a.consultaId, situacao: { in: [...SITUACOES_ABERTAS] } },
          data: { situacao: a.classe, regra: REGRA_IA, gmailRespostaId: a.gmailMensagemId },
        });
        const data = await tx.consultaCotacao.updateMany({
          where: { id: a.consultaId, dataResposta: null },
          data: { dataResposta: a.dataResposta },
        });
        dataRespostaDefinida = data.count > 0;
      }

      await tx.classificacaoIaResposta.updateMany({
        where: { gmailMensagemId: a.gmailMensagemId },
        data: { situacaoAnterior: consulta.situacao, dataRespostaDefinida },
      });
      return "aplicada" as const;
    });
  } catch (e) {
    if (e instanceof AbortarAplicacao) return "ja_resolvida";
    throw e;
  }
}

export type ResultadoDesfazer = "desfeita" | "nada_a_desfazer";

/**
 * Desfaz uma aplicação da IA: reabre a resposta na fila e devolve a consulta ao que era — mas só se
 * a consulta AINDA é o resultado dessa aplicação (`regra = "ia"` e `gmailRespostaId` desta mensagem).
 * Se outra decisão a substituiu nesse meio-tempo, a consulta não é tocada (a decisão mais nova vale).
 */
export async function desfazerAplicacaoIa(gmailMensagemId: string): Promise<ResultadoDesfazer> {
  return db.$transaction(async (tx) => {
    const marca = await tx.classificacaoIaResposta.updateMany({
      where: { gmailMensagemId, aplicadaEm: { not: null }, desfeitaEm: null },
      data: { desfeitaEm: new Date() },
    });
    if (marca.count === 0) return "nada_a_desfazer" as const;

    const linha = await tx.classificacaoIaResposta.findUnique({
      where: { gmailMensagemId },
      select: { consultaId: true, situacaoAnterior: true, dataRespostaDefinida: true, classeIa: true },
    });

    await tx.respostaEmailPendente.updateMany({
      where: { gmailMensagemId },
      data: { resolvidaEm: null },
    });

    if (linha?.consultaId && linha.situacaoAnterior) {
      const anterior = linha.situacaoAnterior as "sem_resposta" | "a_confirmar" | "duvida";
      if (linha.classeIa === "nao_e_resposta") {
        // A aplicação tinha devolvido a consulta a "sem resposta"; o desfazer a põe de volta a
        // "a confirmar" por esta mensagem, se ela ainda está sem resposta.
        if (anterior === "a_confirmar") {
          await tx.consultaCotacao.updateMany({
            where: { id: linha.consultaId, situacao: "sem_resposta" },
            data: { situacao: "a_confirmar", gmailRespostaId: gmailMensagemId, regra: "sinais_ambiguos" },
          });
        }
      } else {
        await tx.consultaCotacao.updateMany({
          where: { id: linha.consultaId, regra: REGRA_IA, gmailRespostaId: gmailMensagemId },
          data: {
            situacao: anterior,
            regra: anterior === "a_confirmar" ? "sinais_ambiguos" : null,
            gmailRespostaId: anterior === "a_confirmar" ? gmailMensagemId : null,
            ...(linha.dataRespostaDefinida ? { dataResposta: null } : {}),
          },
        });
      }
    }
    return "desfeita" as const;
  });
}
