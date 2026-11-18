/**
 * Regras antigas que marcaram a consulta como "orçamento" só por ter anexo (M30.d). Medido: nas
 * divergências julgadas pelo analista a regra errou 11 de 11 — daí a revisão em lote.
 */
export const REGRAS_ORCAMENTO_POR_ANEXO = ["anexo_orcamento", "anexo_orcamento_dominio"] as const;
