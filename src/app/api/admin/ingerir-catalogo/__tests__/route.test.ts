import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  garantirFontes: vi.fn(),
  ingerir: vi.fn(),
}));

vi.mock("@/lib/ingestao/fontesComprasGov", () => ({
  garantirFontesCatalogoComprasGov: mocks.garantirFontes,
}));

vi.mock("@/lib/ingestao/catalogoComprasGov", () => ({
  CONFIG_CATALOGO_CATMAT: { fonteChave: "catmat" },
  CONFIG_CATALOGO_CATSER: { fonteChave: "catser" },
  ingerirCatalogoComprasGov: mocks.ingerir,
}));

import { POST } from "../route";

function requisicao(query: string, authorization?: string): Request {
  return new Request(`https://exemplo.test/api/admin/ingerir-catalogo${query}`, {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

const RESUMO_PADRAO = {
  loteId: "lote-1",
  fonteChave: "catmat",
  totalPaginas: 15,
  paginasProcessadas: 15,
  paginaInicial: 1,
  paginaFinal: 15,
  totalPaginasCatalogo: 688,
  linhasLidas: 7500,
  linhasImportadas: 7500,
  linhasRejeitadas: 0,
  paginasComFalha: [],
};

describe("POST /api/admin/ingerir-catalogo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.ingerir.mockResolvedValue(RESUMO_PADRAO);
  });

  // Mesmo modo de falha já corrigido em /api/jobs/lembretes (CLAUDE.md §9.45): guarda de
  // autenticação nunca pode depender de a variável de ambiente existir.
  it("nega acesso quando ADMIN_MIGRATE_SECRET não está configurado (fail-closed)", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "");

    const res = await POST(requisicao("?fonte=catmat", "Bearer qualquer-coisa"));

    expect(res.status).toBe(401);
    expect(mocks.ingerir).not.toHaveBeenCalled();
  });

  it("nega acesso com Bearer errado", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");

    const res = await POST(requisicao("?fonte=catmat", "Bearer errado"));

    expect(res.status).toBe(401);
    expect(mocks.ingerir).not.toHaveBeenCalled();
  });

  it("rejeita fonte inválida sem chamar a ingestão", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");

    const res = await POST(requisicao("?fonte=sinapi", "Bearer segredo-correto"));

    expect(res.status).toBe(400);
    expect(mocks.ingerir).not.toHaveBeenCalled();
  });

  it("rejeita paginaInicial/paginas não inteiros ou não positivos", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");

    const res = await POST(
      requisicao("?fonte=catmat&paginaInicial=0", "Bearer segredo-correto"),
    );

    expect(res.status).toBe(400);
    expect(mocks.ingerir).not.toHaveBeenCalled();
  });

  it("rejeita paginas acima do teto por chamada, sem chamar a ingestão", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");

    const res = await POST(
      requisicao("?fonte=catmat&paginas=999", "Bearer segredo-correto"),
    );

    expect(res.status).toBe(400);
    expect(mocks.ingerir).not.toHaveBeenCalled();
  });

  it("chama ingerirCatalogoComprasGov com fonte/paginaInicial/paginas corretos e garante as fontes antes", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");

    const res = await POST(
      requisicao("?fonte=catmat&paginaInicial=301&paginas=15", "Bearer segredo-correto"),
    );
    const corpo = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.garantirFontes).toHaveBeenCalled();
    expect(mocks.ingerir).toHaveBeenCalledWith(
      { fonteChave: "catmat" },
      { paginaInicial: 301, maxPaginas: 15 },
    );
    expect(corpo.ok).toBe(true);
  });

  it("concluido=true quando paginaFinal alcança totalPaginasCatalogo", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");
    mocks.ingerir.mockResolvedValue({
      ...RESUMO_PADRAO,
      paginaInicial: 680,
      paginaFinal: 688,
      totalPaginasCatalogo: 688,
    });

    const res = await POST(
      requisicao("?fonte=catmat&paginaInicial=680&paginas=15", "Bearer segredo-correto"),
    );
    const corpo = await res.json();

    expect(corpo.concluido).toBe(true);
    expect(corpo.proximaPagina).toBe(689);
  });

  it("concluido=false e proximaPagina corretos quando ainda restam páginas", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");

    const res = await POST(
      requisicao("?fonte=catmat&paginaInicial=1&paginas=15", "Bearer segredo-correto"),
    );
    const corpo = await res.json();

    expect(corpo.concluido).toBe(false);
    expect(corpo.proximaPagina).toBe(16);
  });

  it("devolve 500 com detalhe do erro quando a ingestão lança exceção, sem derrubar a rota", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");
    mocks.ingerir.mockRejectedValue(new Error("Fonte de referência não cadastrada"));

    const res = await POST(requisicao("?fonte=catser", "Bearer segredo-correto"));
    const corpo = await res.json();

    expect(res.status).toBe(500);
    expect(corpo.ok).toBe(false);
    expect(corpo.erro).toContain("não cadastrada");
  });
});
