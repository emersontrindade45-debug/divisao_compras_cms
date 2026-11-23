import type { ClasseResposta } from "./criterioIa";

/**
 * Política de fechamento das respostas pendentes pela IA (M30.d), decidida pelo usuário em 2026-11-23
 * a partir do histórico de decisões (medido no banco de produção):
 *  - IA "recusa" × decisão anterior: 266 de 269 (98,9%); só nas decididas à mão e COM PDF: 31 de 32;
 *  - IA "dúvida": 17 de 19 (89%); com PDF: 6 de 6;
 *  - IA "orçamento" nas pendentes: 1 de 13 — e com PDF, 0 de 9 (o analista decidiu "recusa" nas 9). O
 *    "orçamento com PDF" que as regras decidem sozinhas NÃO é este caso: o que sobra na fila é
 *    justamente o ambíguo (PDF + texto de recusa);
 *  - IA "não é resposta": 0 de 9.
 *
 * Módulo PURO: só decide se UMA resposta cabe na política. Quem lê o banco e aplica está em
 * `emailCotacao/politicaIa.ts`.
 *
 * A política:
 *  - recusa e dúvida: adota a leitura da IA (com ou sem PDF);
 *  - orçamento e "não é resposta": nunca — ficam para o analista;
 *  - nunca sobrescreve consulta já decidida (orçamento, recusa, dúvida, e-mail inválido): só as que
 *    ainda estão abertas ("a confirmar" ou "sem resposta").
 */

export const CLASSES_DA_POLITICA: readonly ClasseResposta[] = ["recusa", "duvida"];
export const SITUACOES_ABERTAS_DA_POLITICA = ["a_confirmar", "sem_resposta"] as const;

export interface EntradaPolitica {
  classeIa: string;
  /** Situação ATUAL da consulta a que a resposta está ligada. */
  situacaoConsulta: string;
}

export function adotavelPelaPolitica(e: EntradaPolitica): boolean {
  if (!(SITUACOES_ABERTAS_DA_POLITICA as readonly string[]).includes(e.situacaoConsulta)) return false;
  return (CLASSES_DA_POLITICA as readonly string[]).includes(e.classeIa);
}
