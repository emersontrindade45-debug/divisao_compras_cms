import type { ClasseResposta } from "./criterioIa";

/**
 * Fechamento das pendências (M30.d), decidido pelo usuário em 2026-11-23 para "não deixar nenhuma
 * pendência": aplicar TODAS as sugestões da IA nas respostas pendentes cuja consulta ainda está
 * aberta — inclusive "orçamento" e "não é resposta", mesmo com o histórico mostrando que a IA
 * discordou do analista nessas duas classes (0 de 9 em cada) — e dispensar da fila as respostas
 * antigas de out a dez/2025 que a IA nunca leu.
 *
 * Módulo PURO. A invariante que NÃO muda: nunca sobrescrever uma consulta que já tem decisão (de
 * regra, de outra resposta ou do analista). Nesses casos o fechamento só encerra a entrada da fila.
 */

export const CLASSES_DO_FECHAMENTO: readonly ClasseResposta[] = ["orcamento", "recusa", "duvida", "nao_e_resposta"];
export const SITUACOES_ABERTAS_DO_FECHAMENTO = ["a_confirmar", "sem_resposta"] as const;
export const SITUACOES_DECIDIDAS = ["orcamento", "recusa", "duvida", "email_invalido"] as const;

/** Janela de dispensa: respostas de 1º/out/2025 até 31/dez/2025 (limite superior exclusivo). */
export const DISPENSA_DE = new Date("2025-10-01T00:00:00-03:00");
export const DISPENSA_ATE = new Date("2026-01-01T00:00:00-03:00");

export type AcaoDeFechamento = "aplicar" | "fechar_sem_alterar" | "ignorar";

/**
 * O que fazer com uma pendência QUE TEM leitura da IA e consulta ligada:
 *  - consulta aberta e classe conhecida → aplica a sugestão da IA;
 *  - consulta já decidida → só fecha a entrada da fila, sem alterar a consulta;
 *  - qualquer outra coisa → ignora.
 */
export function acaoDeFechamento(e: { classeIa: string; situacaoConsulta: string }): AcaoDeFechamento {
  const classeOk = (CLASSES_DO_FECHAMENTO as readonly string[]).includes(e.classeIa);
  if ((SITUACOES_ABERTAS_DO_FECHAMENTO as readonly string[]).includes(e.situacaoConsulta)) return classeOk ? "aplicar" : "ignorar";
  if ((SITUACOES_DECIDIDAS as readonly string[]).includes(e.situacaoConsulta)) return "fechar_sem_alterar";
  return "ignorar";
}

/**
 * Consulta "a confirmar" cuja entrada da fila JÁ foi encerrada, mas que nunca recebeu a decisão (a
 * classificação foi aplicada só na fila): aplica a leitura da IA direto na consulta. Só quando ela
 * ainda está "a confirmar" — qualquer decisão posterior é preservada — e a classe é conhecida.
 */
export function aplicavelNaConsultaOrfa(e: { classeIa: string; situacaoConsulta: string }): boolean {
  return e.situacaoConsulta === "a_confirmar" && (CLASSES_DO_FECHAMENTO as readonly string[]).includes(e.classeIa);
}

/** A resposta (sem leitura da IA) é das que o usuário mandou remover da fila? */
export function dentroDaDispensa(dataResposta: Date): boolean {
  return dataResposta >= DISPENSA_DE && dataResposta < DISPENSA_ATE;
}
