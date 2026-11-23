import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { processo: { findMany: mocks.findMany } } }));

import { carregarDemanda } from "../demanda";

const ID = "1aXZqYWNer-ZcF9G37DAtAU2Jr40H7XPUN1pEQuPFXng";
const GID = "94296670";
const REMESSAS = [
  "ID Remessa,Data,Horário,Mês,Processo Encaminhado,ID do E-mail",
  "1,05/01/2026,10:00,Janeiro,Geral Nº 92/2026 - volume 1,aaa",
].join("\n");
// O que a PRIMEIRA aba devolveu em 2026-11-23: um painel, sem as colunas Data e Processo.
const PAINEL = ",Painel Estratégico e de Eficiência,\n,Divisão de Compras e Licitações,\n";

function csv(corpo: string) {
  return new Response(corpo, { status: 200, headers: { "content-type": "text/csv; charset=utf-8" } });
}

describe("carregarDemanda: escolha da aba (DEMANDA_PLANILHA_GID)", () => {
  const antes = { id: process.env.DEMANDA_PLANILHA_ID, gid: process.env.DEMANDA_PLANILHA_GID };
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.findMany.mockReset().mockResolvedValue([]);
    process.env.DEMANDA_PLANILHA_ID = ID;
    delete process.env.DEMANDA_PLANILHA_GID;
  });
  afterEach(() => {
    if (antes.id === undefined) delete process.env.DEMANDA_PLANILHA_ID;
    else process.env.DEMANDA_PLANILHA_ID = antes.id;
    if (antes.gid === undefined) delete process.env.DEMANDA_PLANILHA_GID;
    else process.env.DEMANDA_PLANILHA_GID = antes.gid;
  });

  it("com a aba configurada, a URL de exportação leva o gid (última camada, §9.99)", async () => {
    process.env.DEMANDA_PLANILHA_GID = GID;
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(csv(REMESSAS));
    const r = await carregarDemanda(2026);
    expect(f.mock.calls[0]![0]).toBe(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=${GID}`);
    expect(r.estado).toBe("ok");
  });

  it("sem a aba configurada, a URL fica como antes (primeira aba)", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(csv(REMESSAS));
    await carregarDemanda(2026);
    expect(f.mock.calls[0]![0]).toBe(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv`);
  });

  it("valor em branco equivale a não configurado", async () => {
    process.env.DEMANDA_PLANILHA_GID = "   ";
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(csv(REMESSAS));
    await carregarDemanda(2026);
    expect(f.mock.calls[0]![0]).not.toContain("gid=");
  });

  it.each(["94296670&x=1", "abc", "../1", "9429667/edit", "1".repeat(13)])("gid inválido (%s) nunca chega à URL", async (gid) => {
    process.env.DEMANDA_PLANILHA_GID = gid;
    const f = vi.spyOn(globalThis, "fetch");
    const r = await carregarDemanda(2026);
    expect(r.estado).toBe("indisponivel");
    expect(f).not.toHaveBeenCalled();
  });

  it("primeira aba sendo um painel: o motivo ensina a configurar a aba (o caso real de 2026-11-23)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(csv(PAINEL));
    const r = await carregarDemanda(2026);
    expect(r.estado).toBe("indisponivel");
    if (r.estado !== "indisponivel") throw new Error("esperava indisponivel");
    expect(r.motivo).toMatch(/Cabeçalho não reconhecido/);
    expect(r.motivo).toMatch(/DEMANDA_PLANILHA_GID/);
  });

  it("com a aba já configurada e cabeçalho ruim, a dica não repete o que já foi feito", async () => {
    process.env.DEMANDA_PLANILHA_GID = GID;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(csv(PAINEL));
    const r = await carregarDemanda(2026);
    if (r.estado !== "indisponivel") throw new Error("esperava indisponivel");
    expect(r.motivo).toMatch(/Cabeçalho não reconhecido/);
    expect(r.motivo).not.toMatch(/DEMANDA_PLANILHA_GID/);
  });
});
