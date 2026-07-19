import "server-only";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

let avisoEmitido = false;

/**
 * Integração desativada: a API pública de pesquisa de preços (dadosabertos.compras.gov.br,
 * módulo "pesquisa-preco") exige um codigoItemCatalogo exato do catálogo SIASG, e o endpoint
 * que deveria resolver descrição → código (consultarItemMaterial?descricaoItem=) não retorna
 * resultados mesmo com correspondência exata. Sem busca por texto livre viável, não há como
 * alimentar esta fonte a partir da especificação extraída do TR.
 */
export async function buscarPrecosPainelPrecos(_termo: string): Promise<CandidatoSimilaridade[]> {
  if (!avisoEmitido) {
    console.warn(
      "[PainelPrecos] Integração desativada — API pública não oferece busca por texto livre. Ver comentário em painelPrecos.ts.",
    );
    avisoEmitido = true;
  }
  return [];
}
