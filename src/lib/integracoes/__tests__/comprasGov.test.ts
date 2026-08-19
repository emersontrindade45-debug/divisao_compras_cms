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
});

function jsonOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function fetchPorRota(opts: {
  precos?: unknown[];
  pncp?: {
    orgaoEntidadeCnpj: string;
    anoCompraPncp: number;
    sequencialCompraPncp: number;
    existeResultado?: boolean;
    valorTotalHomologado?: number;
    contratacaoExcluida?: boolean;
  } | null;
  faseExterna: "ok" | "404";
}) {
  const spy = vi.spyOn(global, "fetch");
  spy.mockClear();
  spy.mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("comprasnet-fase-externa") && url.includes("/link")) {
      if (opts.faseExterna === "404") {
        return {
          ok: false,
          status: 404,
          text: async () => '{"message":"Compra não encontrada."}',
        } as Response;
      }
      const id = url.split("/compras/")[1]?.split("/")[0] ?? "";
      return {
        ok: true,
        status: 200,
        text: async () =>
          `https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=${id}`,
      } as Response;
    }
    if (url.includes("1.1_consultarContratacoes_PNCP_14133_Id")) {
      const item = opts.pncp
        ? {
            ...opts.pncp,
            existeResultado: opts.pncp.existeResultado ?? true,
            valorTotalHomologado: opts.pncp.valorTotalHomologado ?? 1,
          }
        : null;
      return jsonOk({
        resultado: item ? [item] : [],
        totalRegistros: item ? 1 : 0,
        totalPaginas: 1,
        paginasRestantes: 0,
      });
    }
    return jsonOk({
      resultado: opts.precos ?? [],
      totalRegistros: opts.precos?.length ?? 0,
      totalPaginas: 1,
      paginasRestantes: 0,
    });
  });
  return spy;
}

const PRECO_MACAE = {
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
};

describe("URL pública da compra do Painel", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.db.itemCatalogoReferencia.findMany.mockReset();
  });

  it("grava o edital do PNCP quando a contratação está no PNCP (mesmo se o cnetmobile 404)", async () => {
    mocks.db.itemCatalogoReferencia.findMany.mockResolvedValue([
      { codigo: 7250, descricao: "ENDOSCOPIA DIGESTIVA" },
    ]);
    const fetchSpy = fetchPorRota({
      precos: [PRECO_MACAE],
      pncp: {
        orgaoEntidadeCnpj: "11308894000106",
        anoCompraPncp: 2025,
        sequencialCompraPncp: 87,
      },
      faseExterna: "404",
    });

    const { buscarContratosComprasGov } = await import("../comprasGov");
    const candidatos = await buscarContratosComprasGov("endoscopia digestiva");

    expect(candidatos).toHaveLength(1);
    expect(candidatos[0]).toMatchObject({
      tipoCandidato: "painel_precos",
      fonteUrl: "https://pncp.gov.br/app/editais/11308894000106/2025/87",
    });
    const consultaPrecos = fetchSpy.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes("3_consultarServico"));
    expect(consultaPrecos).toContain("dataResultado=true");
  });

  it("não grava o acompanhamento quando a fase externa responde compra não encontrada e não há PNCP", async () => {
    mocks.db.itemCatalogoReferencia.findMany.mockResolvedValue([
      { codigo: 7250, descricao: "ENDOSCOPIA DIGESTIVA" },
    ]);
    fetchPorRota({ precos: [PRECO_MACAE], pncp: null, faseExterna: "404" });

    const { buscarContratosComprasGov } = await import("../comprasGov");
    const candidatos = await buscarContratosComprasGov("endoscopia digestiva");

    expect(candidatos[0]!.fonteUrl).toBeUndefined();
  });

  it("reconstrói pelo órgão + valor e prefere o PNCP ao acompanhamento", async () => {
    mocks.db.itemCatalogoReferencia.findMany.mockResolvedValue([
      {
        codigo: 23329,
        descricao:
          "PRESTACAO DE SERVICO DE LIMPEZA E CONSERVACAO - AREAS  INTERNAS - 44 HORAS SEMANAIS DIURNAS - PRODUTIVIDADE 600 M2",
      },
    ]);
    fetchPorRota({
      precos: [
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
      pncp: {
        orgaoEntidadeCnpj: "00394452000103",
        anoCompraPncp: 2024,
        sequencialCompraPncp: 23323,
      },
      faseExterna: "ok",
    });

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

    expect(urls).toEqual(["https://pncp.gov.br/app/editais/00394452000103/2024/23323"]);
  });
});

describe("buscarContratosComprasGov — só compras homologadas", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.db.itemCatalogoReferencia.findMany.mockReset();
    mocks.db.itemCatalogoReferencia.findMany.mockResolvedValue([
      { codigo: 7250, descricao: "ENDOSCOPIA DIGESTIVA" },
    ]);
  });

  it("omite compra sem dataResultado, mesmo com dataCompra e preço", async () => {
    fetchPorRota({
      precos: [
        {
          ...PRECO_MACAE,
          idCompra: "99999999999999999",
          dataResultado: null,
          precoUnitario: 1,
        },
        PRECO_MACAE,
      ],
      pncp: {
        orgaoEntidadeCnpj: "11308894000106",
        anoCompraPncp: 2025,
        sequencialCompraPncp: 87,
      },
      faseExterna: "ok",
    });

    const { buscarContratosComprasGov } = await import("../comprasGov");
    const candidatos = await buscarContratosComprasGov("endoscopia digestiva");

    expect(candidatos).toHaveLength(1);
    expect(candidatos[0]!.valorUnitario).toBe(21420.2);
    expect(candidatos[0]!.fonteUrl).toBe("https://pncp.gov.br/app/editais/11308894000106/2025/87");
  });

  it("omite dataResultado sentinela (0001-01-01)", async () => {
    fetchPorRota({
      precos: [{ ...PRECO_MACAE, dataResultado: "0001-01-01" }],
      pncp: null,
      faseExterna: "ok",
    });

    const { buscarContratosComprasGov } = await import("../comprasGov");
    const candidatos = await buscarContratosComprasGov("endoscopia digestiva");

    expect(candidatos).toEqual([]);
  });

  it("omite compra que o PNCP tem sem resultado homologado, mesmo com dataResultado no Painel", async () => {
    fetchPorRota({
      precos: [PRECO_MACAE],
      pncp: {
        orgaoEntidadeCnpj: "11308894000106",
        anoCompraPncp: 2025,
        sequencialCompraPncp: 87,
        existeResultado: false,
        valorTotalHomologado: 0,
      },
      faseExterna: "ok",
    });

    const { buscarContratosComprasGov } = await import("../comprasGov");
    const candidatos = await buscarContratosComprasGov("endoscopia digestiva");

    expect(candidatos).toEqual([]);
  });

  it("omite compra com valorTotalHomologado zerado no PNCP", async () => {
    fetchPorRota({
      precos: [PRECO_MACAE],
      pncp: {
        orgaoEntidadeCnpj: "11308894000106",
        anoCompraPncp: 2025,
        sequencialCompraPncp: 87,
        existeResultado: true,
        valorTotalHomologado: 0,
      },
      faseExterna: "ok",
    });

    const { buscarContratosComprasGov } = await import("../comprasGov");
    const candidatos = await buscarContratosComprasGov("endoscopia digestiva");

    expect(candidatos).toEqual([]);
  });

  it("não publica o acompanhamento cnetmobile de compra não homologada no PNCP", async () => {
    fetchPorRota({
      precos: [],
      pncp: {
        orgaoEntidadeCnpj: "11308894000106",
        anoCompraPncp: 2025,
        sequencialCompraPncp: 87,
        existeResultado: false,
        valorTotalHomologado: 0,
      },
      faseExterna: "ok",
    });

    const { resolverUrlPublicaPorIdCompra } = await import("../comprasGov");
    const url = await resolverUrlPublicaPorIdCompra("92715206000082025");

    expect(url).toBeNull();
  });

  it("não resolve URL de dezenas de idCompra — teto antes do lookup, senão estoura o timeout do assistente", async () => {
    const precos = Array.from({ length: 12 }, (_, i) => ({
      ...PRECO_MACAE,
      idCompra: `927152060000${String(i).padStart(5, "0")}`,
      precoUnitario: 21420.2 + i,
    }));
    const fetchSpy = fetchPorRota({
      precos,
      pncp: {
        orgaoEntidadeCnpj: "11308894000106",
        anoCompraPncp: 2025,
        sequencialCompraPncp: 87,
      },
      faseExterna: "404",
    });

    const { buscarContratosComprasGov } = await import("../comprasGov");
    const candidatos = await buscarContratosComprasGov("endoscopia digestiva");

    expect(candidatos.length).toBeLessThanOrEqual(10);
    const lookupsPncp = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes("1.1_consultarContratacoes_PNCP_14133_Id"),
    );
    expect(lookupsPncp.length).toBeLessThanOrEqual(10);
    expect(lookupsPncp.length).toBeGreaterThan(0);
  });
});
