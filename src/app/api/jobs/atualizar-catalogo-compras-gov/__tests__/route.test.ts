import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ingerirCatalogoComprasGov: vi.fn(),
  garantirFontesCatalogoComprasGov: vi.fn(),
  loteIngestaoFindFirst: vi.fn(),
}));

vi.mock("@/lib/ingestao/catalogoComprasGov", () => ({
  CONFIG_CATALOGO_CATMAT: { fonteChave: "catmat" },
  CONFIG_CATALOGO_CATSER: { fonteChave: "catser" },
  ingerirCatalogoComprasGov: mocks.ingerirCatalogoComprasGov,
}));

vi.mock("@/lib/ingestao/fontesComprasGov", () => ({
  garantirFontesCatalogoComprasGov: mocks.garantirFontesCatalogoComprasGov,
}));

vi.mock("@/lib/db", () => ({
  db: { loteIngestao: { findFirst: mocks.loteIngestaoFindFirst } },
}));

import { GET } from "../route";

function requisicao(authorization?: string): Request {
  return new Request("https://exemplo.test/api/jobs/atualizar-catalogo-compras-gov", {
    headers: authorization ? { authorization } : {},
  });
}

const RESUMO_CATSER = {
  loteId: "lote-catser",
  fonteChave: "catser",
  totalPaginas: 7,
  paginasProcessadas: 7,
  paginaInicial: 1,
  paginaFinal: 7,
  totalPaginasCatalogo: 7,
  linhasLidas: 3096,
  linhasImportadas: 3096,
  linhasRejeitadas: 0,
  paginasComFalha: [],
};

function resumoCatmat(over: Partial<typeof RESUMO_CATSER> = {}) {
  return {
    loteId: "lote-catmat",
    fonteChave: "catmat",
    totalPaginas: 23,
    paginasProcessadas: 23,
    paginaInicial: 1,
    paginaFinal: 23,
    totalPaginasCatalogo: 688,
    linhasLidas: 11500,
    linhasImportadas: 11500,
    linhasRejeitadas: 0,
    paginasComFalha: [],
    ...over,
  };
}

describe("GET /api/jobs/atualizar-catalogo-compras-gov", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.garantirFontesCatalogoComprasGov.mockResolvedValue(undefined);
    mocks.loteIngestaoFindFirst.mockResolvedValue(null);
    mocks.ingerirCatalogoComprasGov.mockImplementation(async (config: { fonteChave: string }) =>
      config.fonteChave === "catser" ? RESUMO_CATSER : resumoCatmat(),
    );
  });

  // Mesmo modo de falha já corrigido em /api/jobs/lembretes (CLAUDE.md §9.45): guarda de
  // autenticação nunca pode depender de a variável de ambiente existir.
  it("nega acesso quando CRON_SECRET não está configurado (fail-closed)", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const res = await GET(requisicao("Bearer qualquer-coisa"));

    expect(res.status).toBe(401);
    expect(mocks.ingerirCatalogoComprasGov).not.toHaveBeenCalled();
    expect(mocks.garantirFontesCatalogoComprasGov).not.toHaveBeenCalled();
  });

  it("nega acesso com Bearer errado", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-correto");

    const res = await GET(requisicao("Bearer errado"));

    expect(res.status).toBe(401);
    expect(mocks.ingerirCatalogoComprasGov).not.toHaveBeenCalled();
  });

  it("garante as fontes antes de ingerir, e ingere CATSER inteiro em modo upsert", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-correto");

    await GET(requisicao("Bearer segredo-correto"));

    expect(mocks.garantirFontesCatalogoComprasGov).toHaveBeenCalled();
    expect(mocks.ingerirCatalogoComprasGov).toHaveBeenCalledWith(
      { fonteChave: "catser" },
      { modoEscrita: "upsert" },
    );
  });

  it("sem lote anterior de catmat, começa da página 1", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-correto");
    mocks.loteIngestaoFindFirst.mockResolvedValue(null);

    await GET(requisicao("Bearer segredo-correto"));

    expect(mocks.loteIngestaoFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fonteReferencia: { chave: "catmat" } },
      }),
    );
    expect(mocks.ingerirCatalogoComprasGov).toHaveBeenCalledWith(
      { fonteChave: "catmat" },
      expect.objectContaining({ paginaInicial: 1, modoEscrita: "upsert" }),
    );
  });

  it("retoma da página seguinte ao último lote gravado (cursor lido de LoteIngestao.urlArquivo)", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-correto");
    mocks.loteIngestaoFindFirst.mockResolvedValue({
      urlArquivo: "https://dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial?pagina=49-71",
    });

    await GET(requisicao("Bearer segredo-correto"));

    expect(mocks.ingerirCatalogoComprasGov).toHaveBeenCalledWith(
      { fonteChave: "catmat" },
      expect.objectContaining({ paginaInicial: 72, modoEscrita: "upsert" }),
    );
  });

  it("dá a volta para a página 1 quando o cursor já passou do fim do catálogo, na mesma execução", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-correto");
    mocks.loteIngestaoFindFirst.mockResolvedValue({
      urlArquivo: "https://dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial?pagina=677-688",
    });
    mocks.ingerirCatalogoComprasGov.mockImplementation(
      async (config: { fonteChave: string }, opcoes?: { paginaInicial?: number }) => {
        if (config.fonteChave === "catser") return RESUMO_CATSER;
        // Primeira tentativa (cursor 689) fica fora do catálogo — sem itens, mesmo padrão medido
        // contra a API real (resultado vazio, totalPaginasCatalogo correto).
        if (opcoes?.paginaInicial === 689) {
          return resumoCatmat({ paginaInicial: 689, paginaFinal: 688, linhasImportadas: 0, linhasLidas: 0 });
        }
        return resumoCatmat({ paginaInicial: 1, paginaFinal: 23 });
      },
    );

    const res = await GET(requisicao("Bearer segredo-correto"));
    const corpo = await res.json();

    // Duas chamadas para catmat: a que estourou o fim (689) e a que deu a volta (1).
    const chamadasCatmat = mocks.ingerirCatalogoComprasGov.mock.calls.filter(
      ([config]) => config.fonteChave === "catmat",
    );
    expect(chamadasCatmat).toHaveLength(2);
    expect(chamadasCatmat[0][1]).toMatchObject({ paginaInicial: 689 });
    expect(chamadasCatmat[1][1]).toMatchObject({ paginaInicial: 1 });

    // A resposta reflete o resultado da volta, não a tentativa vazia.
    expect(corpo.catmat.paginaInicial).toBe(1);
  });

  it("não dá a volta quando o cursor ainda está dentro do catálogo", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-correto");
    mocks.loteIngestaoFindFirst.mockResolvedValue({
      urlArquivo: "https://dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial?pagina=49-71",
    });

    await GET(requisicao("Bearer segredo-correto"));

    const chamadasCatmat = mocks.ingerirCatalogoComprasGov.mock.calls.filter(
      ([config]) => config.fonteChave === "catmat",
    );
    expect(chamadasCatmat).toHaveLength(1);
  });

  it("devolve catser e catmat no corpo da resposta", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-correto");

    const res = await GET(requisicao("Bearer segredo-correto"));
    const corpo = await res.json();

    expect(res.status).toBe(200);
    expect(corpo.catser).toMatchObject({ fonteChave: "catser" });
    expect(corpo.catmat).toMatchObject({ fonteChave: "catmat" });
    expect(corpo.executadoEm).toEqual(expect.any(String));
  });
});
