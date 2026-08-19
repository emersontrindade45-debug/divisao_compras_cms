import { describe, expect, it } from "vitest";
import {
  URL_PAINEL_PRECOS_LITE,
  URL_SINAPI_OFICIAL,
  montarUrlAcompanhamentoCompra,
  resolverLinkOrigem,
} from "../linkOrigem";

describe("montarUrlAcompanhamentoCompra", () => {
  it("monta a página pública oficial da compra no Compras.gov.br", () => {
    expect(montarUrlAcompanhamentoCompra("92715206000082025")).toBe(
      "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=92715206000082025",
    );
  });
});

describe("resolverLinkOrigem", () => {
  it("PNCP: usa a URL gravada e rotula PNCP", () => {
    const origem = resolverLinkOrigem(
      "contratacao_publica",
      "https://pncp.gov.br/app/editais/00394452000103/2025/20569",
    );
    expect(origem).toEqual({
      href: "https://pncp.gov.br/app/editais/00394452000103/2025/20569",
      rotulo: "PNCP",
    });
  });

  it("Painel de Preços: usa o acompanhamento da compra e rotula Painel de Preços", () => {
    const href = montarUrlAcompanhamentoCompra("92715206000082025");
    expect(resolverLinkOrigem("painel_precos", href)).toEqual({
      href,
      rotulo: "Painel de Preços",
    });
  });

  it("SINAPI: usa o portal da Caixa e rotula SINAPI", () => {
    expect(resolverLinkOrigem("preco_referencia", URL_SINAPI_OFICIAL)).toEqual({
      href: URL_SINAPI_OFICIAL,
      rotulo: "SINAPI",
    });
  });

  it("card antigo do Painel (fonteUrl null, inclusive com rótulo contratacao_publica) cai no Lite", () => {
    expect(resolverLinkOrigem("painel_precos", null)).toEqual({
      href: URL_PAINEL_PRECOS_LITE,
      rotulo: "Painel de Preços",
    });
    expect(resolverLinkOrigem("contratacao_publica", null)).toEqual({
      href: URL_PAINEL_PRECOS_LITE,
      rotulo: "Painel de Preços",
    });
  });

  it("SINAPI sem URL gravada ainda aponta para o portal oficial", () => {
    expect(resolverLinkOrigem("preco_referencia", null)).toEqual({
      href: URL_SINAPI_OFICIAL,
      rotulo: "SINAPI",
    });
  });
});
