import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { processo: { findMany: mocks.findMany } } }));

import { baixarCsv, chaveDoNumero, mapaDeProcessos, CACHE_SEGUNDOS, PRAZO_LEITURA_MS } from "../demanda";

const ID = "1aXZqYWNer-ZcF9G37DAtAU2Jr40H7XPUN1pEQuPFXng";
const CSV = [
  "ID Remessa,Data,Horário,Mês,Processo Encaminhado,ID do E-mail",
  "1,05/01/2026,10:00,Janeiro,Geral Nº 92/2026 - volume 1,aaa",
  "2,06/01/2026,11:00,Janeiro,Geral Nº 92/2026 - volume 1,bbb",
  "3,07/01/2026,11:00,Janeiro,Aquisição de Bens Nº 5/2026 - volume 1,ccc",
].join("\n");

function resposta(corpo: string, init: { status?: number; tipo?: string } = {}) {
  return new Response(corpo, { status: init.status ?? 200, headers: { "content-type": init.tipo ?? "text/csv; charset=utf-8" } });
}

describe("baixarCsv", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  it("baixa o CSV da URL de exportação, com prazo e cache de 1 hora (última camada, §9.99)", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(CSV));
    expect(await baixarCsv(ID)).toEqual({ ok: true, texto: CSV });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect((init as { next?: { revalidate: number } }).next?.revalidate).toBe(CACHE_SEGUNDOS);
    expect(CACHE_SEGUNDOS).toBe(3600);
    expect(PRAZO_LEITURA_MS).toBeLessThanOrEqual(15_000);
  });

  it("com a aba, a URL leva o gid", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(CSV));
    await baixarCsv(ID, "94296670");
    expect(f.mock.calls[0]![0]).toBe(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=94296670`);
  });

  it.each([
    [401, "link público"],
    [403, "link público"],
    [500, "500"],
  ])("HTTP %i vira motivo — nunca zeros", async (status, trecho) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta("x", { status }));
    expect(await baixarCsv(ID)).toEqual({ ok: false, motivo: expect.stringContaining(trecho) });
  });

  it("resposta que não é CSV (ex.: login do Google com status 200) NÃO vira planilha — mesmo com corpo parseável", async () => {
    // O corpo é um CSV válido: só a checagem do tipo da resposta o barra (§9.39).
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(CSV, { tipo: "text/html" }));
    expect(await baixarCsv(ID)).toEqual({ ok: false, motivo: expect.stringContaining("não é uma planilha em CSV") });
  });

  it("rede caindo ou estourando o prazo: motivo, sem lançar exceção", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    expect(await baixarCsv(ID)).toEqual({ ok: false, motivo: expect.any(String) });
  });
});

describe("mapaDeProcessos", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
  });
  it("liga pelo número/ano (0092/2026 = 92/2026) lendo só id e número", async () => {
    mocks.findMany.mockResolvedValue([{ id: "p92", numero: "0092/2026" }]);
    expect(await mapaDeProcessos()).toEqual({ "92/2026": { id: "p92", numero: "0092/2026" } });
    expect(mocks.findMany).toHaveBeenCalledWith({ select: { id: true, numero: true } });
  });
  it("banco fora do ar só tira os links", async () => {
    mocks.findMany.mockImplementation(async () => {
      throw new Error("db");
    });
    expect(await mapaDeProcessos()).toEqual({});
  });
});

describe("chaveDoNumero", () => {
  it.each([
    ["0092/2026", "92/2026"],
    ["95/2026", "95/2026"],
    ["Proc. 12148 / 2025", "12148/2025"],
  ])("%s → %s", (n, k) => expect(chaveDoNumero(n)).toBe(k));
  it("sem número/ano, null", () => expect(chaveDoNumero("sem número")).toBeNull());
});
