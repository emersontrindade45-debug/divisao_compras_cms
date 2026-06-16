import { filtrarPorRecencia } from "./filtroRecencia";
import { calcularScoreFinal } from "./scoreFinal";
import type {
  ItemExtraidoTR,
  CandidatoSimilaridade,
  ScoreSimilaridade,
  ProvedorIA,
} from "@/lib/ia/types";

export async function rankearCandidatos(
  itemTR: ItemExtraidoTR,
  candidatos: CandidatoSimilaridade[],
  provedor: ProvedorIA,
): Promise<ScoreSimilaridade[]> {
  const candidatosValidos = filtrarPorRecencia(candidatos);
  if (candidatosValidos.length === 0) return [];

  const avaliacoes = await provedor.rankearSimilaridade(itemTR, candidatosValidos);

  const comScoreFinal = avaliacoes.map((avaliacao) => ({
    ...avaliacao,
    scoreFinal: calcularScoreFinal({
      scoreDescricao: avaliacao.scoreDescricao,
      scoreEspecificacao: avaliacao.scoreEspecificacao,
      scoreUnidadeQuantidade: avaliacao.scoreUnidadeQuantidade,
    }),
  }));

  return comScoreFinal.sort((a, b) => b.scoreFinal - a.scoreFinal);
}
