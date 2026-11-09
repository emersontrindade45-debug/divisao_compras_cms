import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `cachePdm` é estado de módulo — instância nova por teste (CLAUDE.md §9.34).
 */
async function carregar() {
  return import("../comprasGovMateriais");
}

function respostaTexto(texto: string, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => texto } as Response;
}

/**
 * Linha no formato REAL da API (tipos conferidos numa resposta de 2026-11-09):
 * `idCompra` vem como número de 17 dígitos e `codigoPdm` vem como TEXTO. Um
 * fixture com `codigoPdm` numérico passava aqui enquanto a API real tinha
 * todas as linhas descartadas (CLAUDE.md §9.63, §9.77).
 */
function linhaBruta(over: Record<string, string> = {}): string {
  const campos: Record<string, string> = {
    idCompra: "46272305900232025",
    numeroItemCompra: "3",
    codigoItemCatalogo: "292079",
    codigoPdm: '"226"',
    descricaoItem: '"IMPRESSORA MULTIFUNCIONAL, TIPO IMPRESSÃO: LASER"',
    siglaUnidadeFornecimento: '"UN"',
    quantidade: "4.0",
    precoUnitario: "3150.0",
    marca: '"Brother"',
    nomeFornecedor: '"FORNECEDOR X"',
    nomeOrgao: '"PREFEITURA MUNICIPAL DE SANTA FÉ DO SUL"',
    estado: '"SP"',
    municipio: '"SANTA FÉ DO SUL"',
    esfera: '"M"',
    modalidade: "6",
    dataResultado: '"2026-10-29"',
    ...over,
  };
  return (
    "{" +
    Object.entries(campos)
      .map(([k, v]) => `"${k}": ${v}`)
      .join(", ") +
    "}"
  );
}

function pagina(...linhas: string[]): string {
  return `{"resultado": [${linhas.join(",")}], "totalRegistros": ${linhas.length}}`;
}

const CONSULTA = {
  codigoPdm: 226,
  dataInicio: new Date("2024-11-09T00:00:00Z"),
  dataFim: new Date("2026-11-09T00:00:00Z"),
};

describe("citarIdsGrandes", () => {
  it("preserva o idCompra de 17 dígitos que o JSON.parse arredondaria", async () => {
    const { citarIdsGrandes } = await carregar();
    const bruto = '{"idCompra": 46272305900232025, "idCompraItem":46272305900232025003}';

    // Pré-condição que justifica a função: sem ela, o id muda.
    expect(String(JSON.parse(bruto).idCompra)).not.toBe("46272305900232025");

    const lido = JSON.parse(citarIdsGrandes(bruto));
    expect(lido.idCompra).toBe("46272305900232025");
    expect(lido.idCompraItem).toBe("46272305900232025003");
  });

  it("não mexe em idCompra que já vem como string", async () => {
    const { citarIdsGrandes } = await carregar();
    const bruto = '{"idCompra":"38911506000112026"}';
    expect(citarIdsGrandes(bruto)).toBe(bruto);
  });
});

describe("buscarPrecosMaterialPorPdm", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("consulta por família (tipo=codigoPdm) com janela, UF e esfera na URL enviada", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(respostaTexto(pagina()));
    const { buscarPrecosMaterialPorPdm } = await carregar();

    await buscarPrecosMaterialPorPdm({ ...CONSULTA, estado: "SP", esfera: "M" });

    const url = new URL(String(fetchSpy.mock.calls[0]![0]));
    expect(url.pathname).toBe("/modulo-pesquisa-preco/1_consultarMaterial");
    expect(url.searchParams.get("tipo")).toBe("codigoPdm");
    expect(url.searchParams.get("codigo")).toBe("226");
    expect(url.searchParams.get("dataCompraInicio")).toBe("2024-11-09");
    expect(url.searchParams.get("dataCompraFim")).toBe("2026-11-09");
    expect(url.searchParams.get("estado")).toBe("SP");
    expect(url.searchParams.get("esfera")).toBe("M");
    expect(url.searchParams.get("tamanhoPagina")).toBe("500");
  });

  it("omite UF e esfera quando não informadas", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(respostaTexto(pagina()));
    const { buscarPrecosMaterialPorPdm } = await carregar();

    await buscarPrecosMaterialPorPdm(CONSULTA);

    const url = new URL(String(fetchSpy.mock.calls[0]![0]));
    expect(url.searchParams.has("estado")).toBe(false);
    expect(url.searchParams.has("esfera")).toBe(false);
  });

  it("devolve o preço homologado com o idCompra exato, mapeado", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(respostaTexto(pagina(linhaBruta())));
    const { buscarPrecosMaterialPorPdm } = await carregar();

    const [preco] = await buscarPrecosMaterialPorPdm(CONSULTA);

    expect(preco).toMatchObject({
      idCompra: "46272305900232025",
      numeroItemCompra: 3,
      codigoPdm: 226,
      descricaoItem: "IMPRESSORA MULTIFUNCIONAL, TIPO IMPRESSÃO: LASER",
      unidade: "UN",
      quantidade: 4,
      precoUnitario: 3150,
      marca: "Brother",
      nomeOrgao: "PREFEITURA MUNICIPAL DE SANTA FÉ DO SUL",
      modalidade: 6,
    });
    expect(preco!.dataResultado.toISOString().slice(0, 10)).toBe("2026-10-29");
  });

  it("descarta linha sem resultado, com data-sentinela, com preço zero ou sem idCompra", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      respostaTexto(
        pagina(
          linhaBruta({ dataResultado: "null" }),
          linhaBruta({ dataResultado: '"0001-01-01"' }),
          linhaBruta({ dataResultado: '"1900-01-01"' }),
          linhaBruta({ precoUnitario: "0" }),
          linhaBruta({ idCompra: "null" }),
          linhaBruta({ idCompra: "11111111111111111", precoUnitario: "10.0" }),
        ),
      ),
    );
    const { buscarPrecosMaterialPorPdm } = await carregar();

    const precos = await buscarPrecosMaterialPorPdm(CONSULTA);

    expect(precos.map((p) => p.idCompra)).toEqual(["11111111111111111"]);
  });

  it("tipo inesperado num campo de exibição não descarta o preço homologado", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      respostaTexto(pagina(linhaBruta({ marca: "123", modalidade: '"x"', municipio: "{}" }))),
    );
    const { buscarPrecosMaterialPorPdm } = await carregar();

    const [preco] = await buscarPrecosMaterialPorPdm(CONSULTA);

    expect(preco).toMatchObject({ precoUnitario: 3150, marca: null, modalidade: null });
  });

  it("devolve [] quando a API recusa o parâmetro (4xx)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(respostaTexto('{"detail":"inválido"}', 400));
    const { buscarPrecosMaterialPorPdm } = await carregar();

    await expect(buscarPrecosMaterialPorPdm(CONSULTA)).resolves.toEqual([]);
  });

  it("LANÇA no limite de requisições (429) — não é 'sem preço' (medido em 2026-11-09)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(respostaTexto("", 429));
    const { buscarPrecosMaterialPorPdm } = await carregar();

    await expect(buscarPrecosMaterialPorPdm(CONSULTA)).rejects.toThrow(/429/);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("LANÇA quando a fonte não responde — falha não pode virar 'sem preço' (§9.103)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNRESET"));
    const { buscarPrecosMaterialPorPdm } = await carregar();

    await expect(buscarPrecosMaterialPorPdm(CONSULTA)).rejects.toThrow("ECONNRESET");
  });
});

describe("consultarPdmDoItemCatmat", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lê a família (código e nome) do item e guarda em cache", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        respostaTexto(
          '{"resultado":[{"codigoItem":292079,"codigoPdm":226,"nomePdm":"IMPRESSORA MULTIFUNCIONAL"}]}',
        ),
      );
    const { consultarPdmDoItemCatmat } = await carregar();

    const esperado = { codigo: 226, nome: "IMPRESSORA MULTIFUNCIONAL" };
    expect(await consultarPdmDoItemCatmat(292079)).toEqual(esperado);
    expect(await consultarPdmDoItemCatmat(292079)).toEqual(esperado);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchSpy.mock.calls[0]![0]));
    expect(url.pathname).toBe("/modulo-material/4_consultarItemMaterial");
    expect(url.searchParams.get("codigoItem")).toBe("292079");
  });

  it("devolve null quando o item não existe", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(respostaTexto('{"resultado":[]}'));
    const { consultarPdmDoItemCatmat } = await carregar();

    expect(await consultarPdmDoItemCatmat(1)).toBeNull();
  });
});

describe("urlEditalHomologadoPncp", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const contratacao = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      resultado: [
        {
          orgaoEntidadeCnpj: "46377800000127",
          anoCompraPncp: 2026,
          sequencialCompraPncp: 4447,
          existeResultado: true,
          valorTotalHomologado: 115991.4,
          contratacaoExcluida: false,
          ...over,
        },
      ],
    });

  it("devolve o edital do PNCP quando a compra está homologada, consultando pelo idCompra exato", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(respostaTexto(contratacao()));
    const { urlEditalHomologadoPncp } = await carregar();

    expect(await urlEditalHomologadoPncp("18019805000912026")).toBe(
      "https://pncp.gov.br/app/editais/46377800000127/2026/4447",
    );
    const url = new URL(String(fetchSpy.mock.calls[0]![0]));
    expect(url.pathname).toBe("/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id");
    expect(url.searchParams.get("tipo")).toBe("idCompra");
    expect(url.searchParams.get("codigo")).toBe("18019805000912026");
  });

  it("devolve null para compra no PNCP sem resultado ou sem valor homologado (§9.76)", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(respostaTexto(contratacao({ existeResultado: false })))
      .mockResolvedValueOnce(respostaTexto(contratacao({ valorTotalHomologado: 0 })));
    const { urlEditalHomologadoPncp } = await carregar();

    expect(await urlEditalHomologadoPncp("1")).toBeNull();
    expect(await urlEditalHomologadoPncp("2")).toBeNull();
  });

  it("devolve null para compra fora do PNCP", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(respostaTexto('{"resultado":[]}'));
    const { urlEditalHomologadoPncp } = await carregar();

    expect(await urlEditalHomologadoPncp("3")).toBeNull();
  });

  it("LANÇA no 429 em vez de tratar a compra como fora do PNCP", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(respostaTexto("", 429));
    const { urlEditalHomologadoPncp } = await carregar();

    await expect(urlEditalHomologadoPncp("4")).rejects.toThrow(/429/);
  });
});
