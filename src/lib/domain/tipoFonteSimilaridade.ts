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
 * - `preco_referencia` → `contratacao_publica` (mesmo motivo de `painel_precos`
 *   acima): uma tabela de referência ingerida (SINAPI, CADTERC, CATMAT, ...;
 *   M15+) é, para fins da hierarquia da IN 65/2021, mais uma referência
 *   pública de preço — só a proveniência concreta muda, e essa vive na FK
 *   `PrecoReferencia.fonteReferenciaId`, não neste mapeamento.
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
    case "preco_referencia":
      return "contratacao_publica";
    case "site_eletronico":
      return "site_eletronico";
  }
}

/** Resultado da checagem de promovibilidade de um candidato de similaridade. */
export interface PromocaoPermitida {
  permitido: boolean;
  /** Preenchido só quando `permitido` é false; texto exibido ao usuário. */
  motivo?: string;
}

/**
 * Decide se um candidato de similaridade pode ser promovido a Fonte pelo fluxo
 * de similaridade.
 *
 * Conformidade IN 65/2021: a promoção cria a `Evidencia` junto com a `Fonte`,
 * carimbando `dataHoraAcesso` com o instante da promoção. Para contratação
 * pública isso é correto — a evidência é o registro no portal, identificado por
 * URL estável e data do contrato. Para um achado em **site eletrônico** não é:
 * a norma exige a data/hora do acesso **real** à página e o arquivo capturado,
 * e carimbar o instante da promoção seria fabricar o metadado que dá validade à
 * evidência. Esse caminho existe no módulo de sites (`CapturaEvidencia`), que
 * captura URL + data/hora + arquivo — e é para lá que o usuário é mandado.
 *
 * `preco_referencia` é promovível como `contratacao_publica`/`painel_precos`:
 * um `PrecoReferencia` só existe porque o runner de ingestão (M15) já exigiu
 * fonte + competência + evidência (`urlEvidencia`) no momento da gravação —
 * ao contrário do achado de site aberto, não há metadado de conformidade
 * fabricado na promoção.
 *
 * Função pura: sem I/O, sem import de `components/` (CLAUDE.md §9.2).
 */
export function podePromoverCandidato(
  tipo: TipoCandidatoSimilaridade,
): PromocaoPermitida {
  switch (tipo) {
    case "contratacao_publica":
    case "painel_precos":
    case "preco_referencia":
      return { permitido: true };
    case "site_eletronico":
      return {
        permitido: false,
        motivo:
          "Achado em site eletrônico não vira fonte por aqui: a IN 65/2021 exige a data e hora do " +
          "acesso real à página e o arquivo capturado. Registre a captura pelo módulo de Sites e " +
          "promova a partir de lá.",
      };
  }
}
