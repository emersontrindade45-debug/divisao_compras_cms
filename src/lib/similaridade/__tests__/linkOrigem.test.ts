import { describe, expect, it } from "vitest";
import {
  URL_PAINEL_PRECOS_LITE,
  URL_SINAPI_OFICIAL,
  montarUrlAcompanhamentoCompra,
  montarUrlEditalPncp,
  precisaCompletarLinkPainel,
  resolverLinkOrigem,
  linkOrigemDeHref,
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

  it("PNCP sem fonteUrl reconstrói o edital pela identidade", () => {
    expect(
      resolverLinkOrigem("contratacao_publica", null, {
        cnpjOrgao: "00394452000103",
        ano: "2025",
        numeroSequencial: "20569",
      }),
    ).toEqual({
      href: montarUrlEditalPncp({
        cnpjOrgao: "00394452000103",
        ano: "2025",
        numeroSequencial: "20569",
      }),
      rotulo: "PNCP",
    });
  });

  it("Painel de Preços confirmado: rotula pelo host da URL", () => {
    const href = montarUrlAcompanhamentoCompra("16032805900082024");
    expect(linkOrigemDeHref(href, "painel_precos")).toEqual({
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

  it("não usa a home do Lite como se fosse a compra", () => {
    expect(resolverLinkOrigem("painel_precos", null)).toBeNull();
    expect(resolverLinkOrigem("contratacao_publica", null)).toBeNull();
    expect(resolverLinkOrigem("painel_precos", URL_PAINEL_PRECOS_LITE)).toBeNull();
    expect(precisaCompletarLinkPainel("painel_precos", null)).toBe(true);
    expect(precisaCompletarLinkPainel("contratacao_publica", URL_PAINEL_PRECOS_LITE)).toBe(
      true,
    );
    expect(
      precisaCompletarLinkPainel(
        "contratacao_publica",
        null,
        { cnpjOrgao: "1", ano: "2025", numeroSequencial: "2" },
      ),
    ).toBe(false);
  });

  it("não publica o acompanhamento cnetmobile até a fase externa confirmar", () => {
    const acomp = montarUrlAcompanhamentoCompra("92715206000082025");
    expect(resolverLinkOrigem("painel_precos", acomp)).toBeNull();
    expect(precisaCompletarLinkPainel("painel_precos", acomp)).toBe(true);
  });

  it("SINAPI sem URL gravada ainda aponta para o portal oficial", () => {
    expect(resolverLinkOrigem("preco_referencia", null)).toEqual({
      href: URL_SINAPI_OFICIAL,
      rotulo: "SINAPI",
    });
  });
});
