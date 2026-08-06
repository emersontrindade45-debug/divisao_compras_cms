import { filtrarPorRecencia } from "./filtroRecencia";
import { ordenarPorSobreposicaoLexical } from "./sobreposicaoLexical";
import { calcularScoreFinal } from "./scoreFinal";
import type {
  ItemExtraidoTR,
  CandidatoSimilaridade,
  ScoreSimilaridade,
  ProvedorIA,
} from "@/lib/ia/types";

// Mandar centenas de candidatos em um único prompt arrisca exceder o limite de tokens
// de saída do modelo (precisa devolver um array com uma avaliação por candidato, na
// mesma ordem), causando JSON truncado/parse falho. Limita o lote por chamada.
const MAX_CANDIDATOS_POR_CHAMADA = 30;

// Abaixo deste score (escala 0-100), o candidato não tem relação real com o item
// (ex.: livros didáticos retornados para uma caneta) — promovê-lo geraria preço
// público sem rastreabilidade defensável. Melhor ficar sem candidato do que com
// um preço irrelevante.
const SCORE_MINIMO_ACEITAVEL = 70;

// Gate categórico: abaixo disto em scoreDescricao o candidato não é o mesmo tipo de
// produto, e a média ponderada não pode resgatá-lo (especificação neutra + unidade
// compatível bastam para uma categoria errada passar do corte final).
const SCORE_DESCRICAO_MINIMO = 60;

export async function rankearCandidatos(
  itemTR: ItemExtraidoTR,
  candidatos: CandidatoSimilaridade[],
  provedor: ProvedorIA,
  naturezaObjeto?: "bem_consumo" | "servico_continuo" | null,
): Promise<ScoreSimilaridade[]> {
  // Ordena por sobreposição lexical antes do corte: sem isso o slice pega os N
  // primeiros na ordem de chegada da API, podendo descartar os melhores em silêncio.
  const candidatosValidos = ordenarPorSobreposicaoLexical(
    itemTR,
    filtrarPorRecencia(candidatos, naturezaObjeto),
  ).slice(0, MAX_CANDIDATOS_POR_CHAMADA);
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

  return comScoreFinal
    .filter(
      (avaliacao) =>
        avaliacao.scoreFinal >= SCORE_MINIMO_ACEITAVEL &&
        avaliacao.scoreDescricao >= SCORE_DESCRICAO_MINIMO,
    )
    .sort((a, b) => b.scoreFinal - a.scoreFinal);
}
