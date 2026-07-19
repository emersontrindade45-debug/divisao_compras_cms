import type { CandidatoSimilaridade, ItemExtraidoTR } from "@/lib/ia/types";
import { tokenizar, raizPlural } from "./texto";

/**
 * Ordena os candidatos pela quantidade de palavras em comum com o item do TR
 * (descrição + especificação), do maior para o menor, preservando a ordem
 * original em empates. O corte de lote enviado à IA (slice) é arbitrário sem
 * isso: os melhores candidatos podem estar depois do limite e ser descartados
 * em silêncio.
 */
export function ordenarPorSobreposicaoLexical(
  itemTR: ItemExtraidoTR,
  candidatos: CandidatoSimilaridade[],
): CandidatoSimilaridade[] {
  const tokensItem = new Set(
    tokenizar(`${itemTR.descricao} ${itemTR.especificacaoTecnica}`).map(raizPlural),
  );

  const sobreposicao = (candidato: CandidatoSimilaridade) =>
    Array.from(new Set(tokenizar(candidato.fonteDescricao).map(raizPlural))).filter((token) =>
      tokensItem.has(token),
    ).length;

  return candidatos
    .map((candidato, indice) => ({ candidato, indice, score: sobreposicao(candidato) }))
    .sort((a, b) => b.score - a.score || a.indice - b.indice)
    .map((entrada) => entrada.candidato);
}
