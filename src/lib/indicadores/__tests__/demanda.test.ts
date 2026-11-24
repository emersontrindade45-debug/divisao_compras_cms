import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { processo: { findMany: mocks.findMany } } }));

import { carregarDemanda, chaveDoNumero, CACHE_SEGUNDOS, PRAZO_LEITURA_MS } from "../demanda";

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

describe("carregarDemanda", () => {
  const original = process.env.DEMANDA_PLANILHA_ID;
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.findMany.mockReset().mockResolvedValue([{ id: "p92", numero: "0092/2026" }]);
    process.env.DEMANDA_PLANILHA_ID = ID;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.DEMANDA_PLANILHA_ID;
    else process.env.DEMANDA_PLANILHA_ID = original;
  });

  it("sem a variável: não configurada, e nem tenta baixar", async () => {
    delete process.env.DEMANDA_PLANILHA_ID;
    const f = vi.spyOn(globalThis, "fetch");
    expect(await carregarDemanda(2026)).toEqual({ estado: "nao_configurada" });
    expect(f).not.toHaveBeenCalled();
  });

  it.each(["../etc/passwd", "abc", `${ID}?x=1`, `${ID}/edit`])("id com formato inválido (%s) nunca chega à URL", async (id) => {
    process.env.DEMANDA_PLANILHA_ID = id;
    const f = vi.spyOn(globalThis, "fetch");
    const r = await carregarDemanda(2026);
    expect(r.estado).toBe("indisponivel");
    expect(f).not.toHaveBeenCalled();
  });

  it("baixa o CSV da URL de exportação, com prazo e cache de 1 hora (última camada, §9.99)", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(CSV));
    await carregarDemanda(2026);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect((init as { next?: { revalidate: number } }).next?.revalidate).toBe(CACHE_SEGUNDOS);
    expect(CACHE_SEGUNDOS).toBe(3600);
    expect(PRAZO_LEITURA_MS).toBeLessThanOrEqual(15_000);
  });

  it("lê a planilha, calcula a demanda e liga ao cadastro pelo número/ano (0092/2026 = 92/2026)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(CSV));
    const r = await carregarDemanda(2026);
    if (r.estado !== "ok") throw new Error("esperava ok");
    expect(r.demanda).toMatchObject({ remessas: 3, processosDistintos: 2, processosQueVoltaram: 0, recorrencias: 0 });
    expect(r.noSistema).toEqual({ "92/2026": { id: "p92", numero: "0092/2026" } });
    expect(mocks.findMany).toHaveBeenCalledWith({ select: { id: true, numero: true } });
  });

  it.each([
    [401, "link público"],
    [403, "link público"],
    [500, "500"],
  ])("HTTP %i vira 'indisponível' com motivo — nunca zeros", async (status, trecho) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta("x", { status }));
    const r = await carregarDemanda(2026);
    expect(r).toEqual({ estado: "indisponivel", motivo: expect.stringContaining(trecho) });
  });

  it("resposta que não é CSV (ex.: login do Google com status 200) NÃO vira planilha — mesmo com corpo parseável", async () => {
    // O corpo é um CSV válido: só a checagem do tipo da resposta o barra. Com "<html>…" o teste
    // passaria também pela falha de cabeçalho e não provaria nada (§9.39).
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(CSV, { tipo: "text/html" }));
    expect(await carregarDemanda(2026)).toEqual({
      estado: "indisponivel",
      motivo: expect.stringContaining("não é uma planilha em CSV"),
    });
  });

  it("cabeçalho irreconhecível = indisponível, não 'nenhuma remessa'", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta("a,b\n1,2"));
    expect((await carregarDemanda(2026)).estado).toBe("indisponivel");
  });

  it("rede caindo ou estourando o prazo: indisponível, sem lançar exceção", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    expect(await carregarDemanda(2026)).toEqual({ estado: "indisponivel", motivo: expect.any(String) });
  });

  it("banco fora do ar só tira os links: a demanda continua", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(CSV));
    mocks.findMany.mockRejectedValue(new Error("db"));
    const r = await carregarDemanda(2026);
    expect(r.estado === "ok" && r.noSistema).toEqual({});
    expect(r.estado).toBe("ok");
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
