/**
 * URL e rótulo da fonte de origem de um candidato, para o card do assistente
 * e a tabela de similares. Cada tipo tem o mesmo papel que o link do PNCP:
 * um endereço público conferível, com o nome da fonte no texto do link.
 *
 * Painel de Preços / Compras.gov: a API `3_consultarServico` devolve `idCompra`
 * (medido no OpenAPI e numa resposta real em 2026-08-19). A página pública
 * oficial da compra é o acompanhamento do Compras.gov.br, o mesmo formato
 * usado pelo próprio portal (`?compra={idCompra}`). Sem `idCompra` (registros
 * antigos gravados com `fonteUrl: null`), cai no Pesquisa de Preços Lite —
 * origem da série, sem deep-link da compra.
 */

export const URL_PAINEL_PRECOS_LITE =
  "https://pesquisaprecos.compras.gov.br/pesquisa-precos-frontend-semlogin/";

export const URL_SINAPI_OFICIAL = "https://www.caixa.gov.br/site/Paginas/downloads.aspx";

const BASE_ACOMPANHAMENTO_COMPRA =
  "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra";

/** Página pública da compra no Compras.gov.br (NLLC), a partir do `idCompra` da API. */
export function montarUrlAcompanhamentoCompra(idCompra: string): string {
  return `${BASE_ACOMPANHAMENTO_COMPRA}?compra=${encodeURIComponent(idCompra)}`;
}

export interface LinkOrigemCandidato {
  href: string;
  rotulo: "PNCP" | "Painel de Preços" | "SINAPI";
}

function rotuloPelaUrl(fonteUrl: string): LinkOrigemCandidato["rotulo"] | null {
  if (fonteUrl.includes("pncp.gov.br")) return "PNCP";
  if (
    fonteUrl.includes("cnetmobile.estaleiro.serpro.gov.br") ||
    fonteUrl.includes("pesquisaprecos.compras.gov.br")
  ) {
    return "Painel de Preços";
  }
  if (fonteUrl.includes("caixa.gov.br")) return "SINAPI";
  return null;
}

/**
 * Resolve o link de origem a exibir no card.
 *
 * `fonteUrl` gravado ganha. Sem URL: Painel de Preços (e o rótulo antigo
 * `contratacao_publica` sem link, que era o Painel antes de 933ec5e) aponta
 * para o Lite; SINAPI aponta para o portal da Caixa.
 */
export function resolverLinkOrigem(
  tipoCandidato: string,
  fonteUrl: string | null | undefined,
): LinkOrigemCandidato | null {
  if (fonteUrl) {
    return { href: fonteUrl, rotulo: rotuloPelaUrl(fonteUrl) ?? rotuloPeloTipo(tipoCandidato) };
  }
  if (tipoCandidato === "preco_referencia") {
    return { href: URL_SINAPI_OFICIAL, rotulo: "SINAPI" };
  }
  if (tipoCandidato === "painel_precos" || tipoCandidato === "contratacao_publica") {
    return { href: URL_PAINEL_PRECOS_LITE, rotulo: "Painel de Preços" };
  }
  return null;
}

function rotuloPeloTipo(tipoCandidato: string): LinkOrigemCandidato["rotulo"] {
  if (tipoCandidato === "preco_referencia") return "SINAPI";
  if (tipoCandidato === "painel_precos") return "Painel de Preços";
  return "PNCP";
}
