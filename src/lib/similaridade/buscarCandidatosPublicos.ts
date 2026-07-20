import { buscarContratosPNCPMultiTermo } from "@/lib/integracoes/pncp";
import { buscarPrecosPainelPrecos } from "@/lib/integracoes/painelPrecos";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

/**
 * Busca candidatos de preço público usando múltiplos termos em paralelo.
 * Termos alternativos (sinônimos, variações) aumentam o universo de candidatos
 * encontrados no PNCP, onde a mesma atividade pode ter descrições distintas
 * em contratos diferentes (ex.: "lavagem", "limpeza", "higienização").
 */
export async function buscarCandidatosPublicos(
  termos: string | string[],
): Promise<CandidatoSimilaridade[]> {
  const listaTermos = Array.isArray(termos) ? termos : [termos];

  const [contratos, precos] = await Promise.all([
    buscarContratosPNCPMultiTermo(listaTermos),
    buscarPrecosPainelPrecos(listaTermos[0] ?? ""),
  ]);
  return [...contratos, ...precos];
}
