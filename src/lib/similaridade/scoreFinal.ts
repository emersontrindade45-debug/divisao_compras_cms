export const PESOS_SIMILARIDADE = {
  descricao: 0.55,       // É o mesmo tipo de serviço/produto? (critério dominante)
  especificacao: 0.28,   // Detalhes técnicos compatíveis (não penalizar ausência de info)
  unidadeQuantidade: 0.17, // Unidade e ordem de grandeza compatíveis
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
