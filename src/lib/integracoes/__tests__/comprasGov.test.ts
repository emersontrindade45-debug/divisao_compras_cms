import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = { itemCatalogoReferencia: { findMany: vi.fn() } };
  return { db };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));

/**
 * `catalogoCache`/`carregandoCache` são estado de módulo — cada teste precisa
 * de uma instância nova (`vi.resetModules()` + import dinâmico), senão o
 * cache de um teste vaza para o seguinte (CLAUDE.md §9.34).
 */
describe("buscarContratosComprasGov — fonte do catálogo CATSER", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.db.itemCatalogoReferencia.findMany.mockReset();
  });

  it("usa ItemCatalogoReferencia (tabela local) quando ela tem dados para catser", async () => {
    mocks.db.itemCatalogoReferencia.findMany.mockResolvedValue([
      { codigo: 7250, descricao: "ENDOSCOPIA DIGESTIVA" },
    ]);
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        resultado: [],
        totalRegistros: 0,
        totalPaginas: 0,
        paginasRestantes: 0,
      }),
    } as Response);

    const { buscarContratosComprasGov } = await import("../comprasGov");
    await buscarContratosComprasGov("endoscopia digestiva");

    expect(mocks.db.itemCatalogoReferencia.findMany).toHaveBeenCalledWith({
      where: { fonteChave: "catser", ativo: true },
      select: { codigo: true, descricao: true },
    });

    const chamouCatalogoPorRequest = fetchSpy.mock.calls.some(([url]) =>
      String(url).includes("6_consultarItemServico"),
    );
    expect(chamouCatalogoPorRequest).toBe(false);
  });

  it("cai no download por request (fallback) quando a tabela está vazia, com aviso de log", async () => {
    mocks.db.itemCatalogoReferencia.findMany.mockResolvedValue([]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        resultado: [],
        totalRegistros: 0,
        totalPaginas: 1,
        paginasRestantes: 0,
      }),
    } as Response);

    const { buscarContratosComprasGov } = await import("../comprasGov");
    await buscarContratosComprasGov("qualquer termo");

    const chamouCatalogoPorRequest = fetchSpy.mock.calls.some(([url]) =>
      String(url).includes("6_consultarItemServico"),
    );
    expect(chamouCatalogoPorRequest).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ItemCatalogoReferencia vazia"));
  });

  it("grava fonteUrl com o acompanhamento da compra quando a API traz idCompra", async () => {
    mocks.db.itemCatalogoReferencia.findMany.mockResolvedValue([
      { codigo: 7250, descricao: "ENDOSCOPIA DIGESTIVA" },
    ]);
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        resultado: [
          {
            idCompra: "92715206000082025",
            descricaoItem: "ENDOSCOPIA DIGESTIVA CIRURGICA",
            codigoItemCatalogo: 7250,
            nomeUnidadeMedida: "UNIDADE",
            siglaUnidadeMedida: "UN",
            quantidade: 1,
            precoUnitario: 21420.2,
            niFornecedor: "35830868000446",
            nomeFornecedor: "UNIMED",
            codigoUasg: "927152",
            nomeUasg: "FUNDO MUNICIPAL DE SAUDE DE MACAE - RJ",
            codigoOrgao: 99008,
            nomeOrgao: "FUNDO MUNICIPAL DE SAUDE DE MACAE",
            dataCompra: "2025-09-08",
            dataResultado: "2025-09-09",
          },
        ],
        totalRegistros: 1,
        totalPaginas: 1,
        paginasRestantes: 0,
      }),
    } as Response);

    const { buscarContratosComprasGov } = await import("../comprasGov");
    const candidatos = await buscarContratosComprasGov("endoscopia digestiva");

    expect(candidatos).toHaveLength(1);
    expect(candidatos[0]).toMatchObject({
      tipoCandidato: "painel_precos",
      fonteUrl:
        "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=92715206000082025",
    });
  });

  it("reconstrói a URL da compra pelo órgão + valor, sem cair na home do Lite", async () => {
    mocks.db.itemCatalogoReferencia.findMany.mockResolvedValue([
      {
        codigo: 23329,
        descricao:
          "PRESTACAO DE SERVICO DE LIMPEZA E CONSERVACAO - AREAS  INTERNAS - 44 HORAS SEMANAIS DIURNAS - PRODUTIVIDADE 600 M2",
      },
    ]);
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        resultado: [
          {
            idCompra: "16032805900082024",
            descricaoItem:
              "PRESTACAO DE SERVICO DE LIMPEZA E CONSERVACAO - AREAS  INTERNAS - 44 HORAS SEMANAIS DIURNAS - PRODUTIVIDADE 600 M2",
            codigoItemCatalogo: 23329,
            nomeUnidadeMedida: "METRO QUADRADO",
            siglaUnidadeMedida: "M2",
            quantidade: 7,
            precoUnitario: 52147,
            niFornecedor: "1",
            nomeFornecedor: "X",
            codigoUasg: "160328",
            nomeUasg: "LABORATORIO QUIMICO FARMACEUTICO DO EXERCITO",
            codigoOrgao: 1,
            nomeOrgao: "COMANDO DO EXERCITO",
            dataCompra: "2025-07-09",
            dataResultado: "2025-07-09",
          },
        ],
        totalRegistros: 1,
        totalPaginas: 1,
        paginasRestantes: 0,
      }),
    } as Response);

    const { resolverUrlsAcompanhamentoPainel } = await import("../comprasGov");
    const urls = await resolverUrlsAcompanhamentoPainel([
      {
        fonteDescricao:
          "PRESTACAO DE SERVICO DE LIMPEZA E CONSERVACAO - AREAS  INTERNAS - 44 HORAS SEMANAIS DIURNAS - PRODUTIVIDADE 600 M2",
        fonteOrgaoOuId: "COMANDO DO EXERCITO",
        valorUnitario: 52147,
        dataReferencia: "2025-07-09T00:00:00.000Z",
      },
    ]);

    expect(urls).toEqual([
      "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=16032805900082024",
    ]);
  });
});
