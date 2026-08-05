import "server-only";
import { buscarContratosComprasGov } from "./comprasGov";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

/**
 * Fonte secundária de preços: Compras.gov.br (dadosabertos.compras.gov.br).
 *
 * Complementa o PNCP com dados do SIASG/COMPRASNET, incluindo compras
 * realizadas antes da obrigatoriedade do PNCP e contratos de órgãos federais
 * publicados nos dois sistemas em paralelo.
 *
 * Estratégia: matching de tokens do termo de busca contra o catálogo CATSER
 * (3 014 serviços) + consulta ao módulo de pesquisa de preços. Sem busca por
 * texto livre na API (limitação do fornecedor); cobertura é maior para
 * serviços com código CATSER bem definido (TI, saúde, alimentação) do que
 * para serviços de manutenção predial, que usam nomenclatura técnica distinta.
 */
export async function buscarPrecosPainelPrecos(
  termo: string,
): Promise<CandidatoSimilaridade[]> {
  return buscarContratosComprasGov(termo);
}
