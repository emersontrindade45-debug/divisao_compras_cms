export const PESOS_SIMILARIDADE = {
  descricao: 0.4,
  especificacao: 0.35,
  unidadeQuantidade: 0.25,
} as const;

export function calcularScoreFinal(params: {
  scoreDescricao: number;
  scoreEspecificacao: number;
  scoreUnidadeQuantidade: number;
}): number {
  const raw =
    params.scoreDescricao * PESOS_SIMILARIDADE.descricao +
    params.scoreEspecificacao * PESOS_SIMILARIDADE.especificacao +
    params.scoreUnidadeQuantidade * PESOS_SIMILARIDADE.unidadeQuantidade;
  return Math.round(raw * 100) / 100;
}
