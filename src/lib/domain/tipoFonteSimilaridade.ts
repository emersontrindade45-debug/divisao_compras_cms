import type { TipoCandidatoSimilaridade, TipoFonte } from "@prisma/client";

/**
 * Mapeia o tipo de candidato de similaridade para o `TipoFonte` correspondente
 * ao promover o candidato para uma Fonte oficial da estimativa.
 *
 * Decisão de projeto (IN 65/2021):
 * - `contratacao_publica` → `contratacao_publica` (mapeamento direto).
 * - `painel_precos` → `contratacao_publica`. O `TipoFonte` não possui um valor
 *   `painel_precos`; tanto contratações públicas quanto o Painel de Preços são
 *   *referências públicas de preço* (a fonte prioritária da IN 65/2021), sujeitas
 *   à mesma janela de validade de 365 dias. Tratá-los sob o mesmo `TipoFonte`
 *   mantém a validação de validade (`validarValidadeFontes`) coerente sem
 *   inventar um valor de enum inexistente.
 *
 * Função pura: não importa de `components/` nem toca em I/O (CLAUDE.md §9-2).
 * As strings dos dois enums seguem a mesma convenção (underscore) em todos os
 * pontos de comparação (CLAUDE.md §9-6).
 */
export function mapTipoCandidatoParaFonte(
  tipo: TipoCandidatoSimilaridade,
): TipoFonte {
  switch (tipo) {
    case "contratacao_publica":
      return "contratacao_publica";
    case "painel_precos":
      return "contratacao_publica";
  }
}
