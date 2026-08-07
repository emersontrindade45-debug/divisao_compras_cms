import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    fonteReferencia: { findUnique: vi.fn() },
    loteIngestao: { create: vi.fn(), update: vi.fn() },
    itemCatalogoReferencia: { createMany: vi.fn() },
  };
  return { db };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { CONFIG_CATALOGO_CATMAT, ingerirCatalogoComprasGov } from "../catalogoComprasGov";
import { normalizar } from "@/lib/similaridade/texto";

const FONTE_ID = "fonte-catmat";
const LOTE_ID = "lote-1";

function itemCatmat(pagina: number, indice = 0, over: Record<string, unknown> = {}) {
  return {
    codigoItem: pagina * 1000 + indice,
    codigoClasse: 7110,
    descricaoItem: `CADEIRA ESCRITÓRIO MODELO ${pagina}-${indice}`,
    statusItem: true,
    ...over,
  };
}

function respostaPagina(resultado: unknown[], totalPaginas: number, pagina: number) {
  return {
    ok: true,
    json: async () => ({
      resultado,
      totalRegistros: totalPaginas * Math.max(resultado.length, 1),
      totalPaginas,
      paginasRestantes: Math.max(0, totalPaginas - pagina),
    }),
  } as Response;
}

function paginaDaUrl(url: string): number {
  return Number(new URL(url).searchParams.get("pagina"));
}

describe("ingerirCatalogoComprasGov", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.fonteReferencia.findUnique.mockResolvedValue({ id: FONTE_ID, ativa: true });
    mocks.db.loteIngestao.create.mockResolvedValue({ id: LOTE_ID });
    mocks.db.loteIngestao.update.mockResolvedValue({});
    mocks.db.itemCatalogoReferencia.createMany.mockImplementation(
      async ({ data }: { data: unknown[] }) => ({ count: data.length }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejeita fonte não cadastrada sem criar lote", async () => {
    mocks.db.fonteReferencia.findUnique.mockResolvedValue(null);
    vi.spyOn(global, "fetch");

    await expect(ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATMAT)).rejects.toThrow(
      /não cadastrada/,
    );
    expect(mocks.db.loteIngestao.create).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejeita fonte inativa sem criar lote", async () => {
    mocks.db.fonteReferencia.findUnique.mockResolvedValue({ id: FONTE_ID, ativa: false });
    vi.spyOn(global, "fetch");

    await expect(ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATMAT)).rejects.toThrow(/inativa/);
    expect(mocks.db.loteIngestao.create).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("lança erro quando a primeira página não pode ser carregada", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 404 } as Response);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATMAT)).rejects.toThrow(
      /primeira página/,
    );
    expect(mocks.db.loteIngestao.create).not.toHaveBeenCalled();
  });

  it("pagina até paginasRestantes <= 0, respeitando a concorrência configurada (CLAUDE.md §9.11)", async () => {
    const TOTAL_PAGINAS = 6;
    const CONCORRENCIA = 2;

    let emVoo = 0;
    let picoSimultaneo = 0;

    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      emVoo++;
      picoSimultaneo = Math.max(picoSimultaneo, emVoo);
      await new Promise((resolve) => setTimeout(resolve, 5));
      emVoo--;

      const pagina = paginaDaUrl(String(url));
      return respostaPagina([itemCatmat(pagina)], TOTAL_PAGINAS, pagina);
    });

    const resumo = await ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATMAT, {
      concorrencia: CONCORRENCIA,
    });

    expect(global.fetch).toHaveBeenCalledTimes(TOTAL_PAGINAS);
    expect(picoSimultaneo).toBeLessThanOrEqual(CONCORRENCIA);
    expect(resumo).toMatchObject({
      totalPaginas: TOTAL_PAGINAS,
      paginasProcessadas: TOTAL_PAGINAS,
      linhasLidas: TOTAL_PAGINAS,
      linhasImportadas: TOTAL_PAGINAS,
      linhasRejeitadas: 0,
    });
  });

  it("respeita maxPaginas — só busca as páginas pedidas, mesmo com totalPaginas maior (uso: teste manual/local)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const pagina = paginaDaUrl(String(url));
      return respostaPagina([itemCatmat(pagina)], 688, pagina);
    });

    const resumo = await ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATMAT, { maxPaginas: 3 });

    expect(resumo.totalPaginas).toBe(3);
    expect(resumo.paginasProcessadas).toBe(3);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("rejeita a página inteira quando a resposta não bate com o schema Zod, sem interromper as demais", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const pagina = paginaDaUrl(String(url));
      if (pagina === 2) {
        // codigoItem como string — inválido contra o schema (espera number): a página inteira
        // é descartada, não só o item malformado.
        return respostaPagina([{ codigoItem: "abc", descricaoItem: "X" }], 3, pagina);
      }
      return respostaPagina([itemCatmat(pagina)], 3, pagina);
    });

    const resumo = await ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATMAT);

    expect(resumo.linhasLidas).toBe(2); // páginas 1 e 3 — página 2 rejeitada inteira
    expect(resumo.linhasImportadas).toBe(2);
    expect(console.error).toHaveBeenCalled();
  });

  it("rejeita item sem descrição (via mapear), contando como rejeitado e sem gravar", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      respostaPagina([itemCatmat(1, 0), itemCatmat(1, 1, { descricaoItem: "   " })], 1, 1),
    );

    const resumo = await ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATMAT);

    expect(resumo.linhasLidas).toBe(2);
    expect(resumo.linhasImportadas).toBe(1);
    expect(resumo.linhasRejeitadas).toBe(1);
  });

  it("calcula descricaoNormalizada com normalizar() de texto.ts — não reimplementa", async () => {
    const descricaoBruta = "CADEIRA ESCRITÓRIO, TIPO GIRATÓRIA";
    vi.spyOn(global, "fetch").mockResolvedValue(
      respostaPagina([itemCatmat(1, 0, { descricaoItem: descricaoBruta })], 1, 1),
    );

    await ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATMAT);

    expect(mocks.db.itemCatalogoReferencia.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          fonteChave: "catmat",
          descricao: descricaoBruta,
          descricaoNormalizada: normalizar(descricaoBruta),
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("cria o LoteIngestao no início e atualiza com os contadores finais no fim", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(respostaPagina([itemCatmat(1)], 1, 1));

    const resumo = await ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATMAT);

    expect(mocks.db.loteIngestao.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fonteReferenciaId: FONTE_ID,
        urlArquivo: expect.stringContaining("/modulo-material/4_consultarItemMaterial"),
        checksum: expect.any(String),
        iniciadoEm: expect.any(Date),
        competencia: expect.any(String),
      }),
      select: { id: true },
    });

    expect(mocks.db.loteIngestao.update).toHaveBeenCalledWith({
      where: { id: LOTE_ID },
      data: {
        linhasLidas: 1,
        linhasImportadas: 1,
        linhasRejeitadas: 0,
        concluidoEm: expect.any(Date),
        erro: null,
      },
    });

    expect(resumo.loteId).toBe(LOTE_ID);
  });

  it("grava LoteIngestao.erro quando uma página esgota os retries — não fica só no console.warn", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const pagina = paginaDaUrl(String(url));
      if (pagina === 2) throw new Error("ECONNRESET simulado");
      return respostaPagina([itemCatmat(pagina)], 3, pagina);
    });

    const resumo = await ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATMAT);

    // Páginas 1 e 3 gravadas normalmente; só a 2 falhou — a ingestão não trava por uma página.
    expect(resumo.paginasComFalha).toEqual([2]);
    expect(resumo.linhasLidas).toBe(2);

    expect(mocks.db.loteIngestao.update).toHaveBeenCalledWith({
      where: { id: LOTE_ID },
      data: expect.objectContaining({
        erro: expect.stringMatching(/1 de 3 páginas falharam.*\[2\]/),
      }),
    });
  });
});
