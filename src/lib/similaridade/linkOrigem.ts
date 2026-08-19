/**
 * URL e rótulo da fonte de origem de um candidato, para o card do assistente
 * e a tabela de similares. Cada tipo tem o mesmo papel que o link do PNCP:
 * um endereço público da **contratação específica**, com o nome da fonte no
 * texto do link.
 *
 * Painel de Preços / Compras.gov: a API `3_consultarServico` devolve `idCompra`
 * (medido no OpenAPI e numa resposta real em 2026-08-19). A página pública
 * oficial da compra é o acompanhamento do Compras.gov.br (`?compra={idCompra}`).
 *
 * A home do Pesquisa de Preços Lite NÃO é evidência da compra — é a porta de
 * entrada do portal. Cards antigos gravados com `fonteUrl: null` (ou com a
 * home do Lite persistida por engano) não podem apontar para ela: ou se
 * reconstrói o `idCompra`, ou o link some. Ver CLAUDE.md §9.74.
 */

export const URL_PAINEL_PRECOS_LITE =
  "https://pesquisaprecos.compras.gov.br/pesquisa-precos-frontend-semlogin/";

export const URL_SINAPI_OFICIAL = "https://www.caixa.gov.br/site/Paginas/downloads.aspx";

const BASE_ACOMPANHAMENTO_COMPRA =
  "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra";

const BASE_EDITAL_PNCP = "https://pncp.gov.br/app/editais";

/** Página pública da compra no Compras.gov.br (NLLC), a partir do `idCompra` da API. */
export function montarUrlAcompanhamentoCompra(idCompra: string): string {
  return `${BASE_ACOMPANHAMENTO_COMPRA}?compra=${encodeURIComponent(idCompra)}`;
}

/** Mesmo formato de `montarUrlEdital` em `lib/integracoes/pncp.ts` — duplicado porque aquele módulo é `server-only`. */
export function montarUrlEditalPncp(partes: {
  cnpjOrgao: string;
  ano: string;
  numeroSequencial: string;
}): string {
  return `${BASE_EDITAL_PNCP}/${partes.cnpjOrgao}/${partes.ano}/${partes.numeroSequencial}`;
}

export function ehUrlGenericaPainel(url: string): boolean {
  return url.includes("pesquisaprecos.compras.gov.br");
}

export function ehUrlAcompanhamentoCompra(url: string): boolean {
  return url.includes("cnetmobile.estaleiro.serpro.gov.br");
}

export interface LinkOrigemCandidato {
  href: string;
  rotulo: "PNCP" | "Painel de Preços" | "SINAPI";
}

export interface IdentidadeUrlPncp {
  cnpjOrgao: string;
  ano: string;
  numeroSequencial: string;
}

function rotuloPelaUrl(fonteUrl: string): LinkOrigemCandidato["rotulo"] | null {
  if (fonteUrl.includes("pncp.gov.br")) return "PNCP";
  if (ehUrlAcompanhamentoCompra(fonteUrl) || ehUrlGenericaPainel(fonteUrl)) {
    return "Painel de Preços";
  }
  if (fonteUrl.includes("caixa.gov.br")) return "SINAPI";
  return null;
}

function rotuloPeloTipo(tipoCandidato: string): LinkOrigemCandidato["rotulo"] {
  if (tipoCandidato === "preco_referencia") return "SINAPI";
  if (tipoCandidato === "painel_precos") return "Painel de Preços";
  return "PNCP";
}

/**
 * Resolve o link de origem a exibir no card — só URL da contratação/tabela
 * específica. A home do Lite é tratada como ausência.
 *
 * `identidade` reconstrói o edital do PNCP quando a URL não foi gravada.
 * Sem URL específica e sem identidade, devolve `null` (o card do Painel
 * completa o `idCompra` à parte, via `completarLinksOrigemCandidatos`).
 */
export function resolverLinkOrigem(
  tipoCandidato: string,
  fonteUrl: string | null | undefined,
  identidade?: IdentidadeUrlPncp | null,
): LinkOrigemCandidato | null {
  if (fonteUrl && !ehUrlGenericaPainel(fonteUrl)) {
    return { href: fonteUrl, rotulo: rotuloPelaUrl(fonteUrl) ?? rotuloPeloTipo(tipoCandidato) };
  }
  if (identidade?.cnpjOrgao && identidade.ano && identidade.numeroSequencial) {
    return { href: montarUrlEditalPncp(identidade), rotulo: "PNCP" };
  }
  if (tipoCandidato === "preco_referencia") {
    return { href: URL_SINAPI_OFICIAL, rotulo: "SINAPI" };
  }
  return null;
}

/**
 * Card do Painel (rótulo novo ou o antigo `contratacao_publica` sem edital PNCP)
 * ainda sem a URL da compra — precisa consultar `idCompra` na API.
 */
export function precisaCompletarLinkPainel(
  tipoCandidato: string,
  fonteUrl: string | null | undefined,
  identidade?: IdentidadeUrlPncp | null,
): boolean {
  if (resolverLinkOrigem(tipoCandidato, fonteUrl, identidade)) return false;
  if (tipoCandidato === "painel_precos") return true;
  if (tipoCandidato === "contratacao_publica") return true;
  return false;
}
