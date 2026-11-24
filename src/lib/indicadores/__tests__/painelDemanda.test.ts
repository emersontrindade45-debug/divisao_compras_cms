import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  obterPlanilha: vi.fn(),
  lerAba: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { processo: { findMany: mocks.findMany } } }));
vi.mock("@/lib/sheets/googleAuth", () => ({
  getSheetsClient: () => ({ spreadsheets: { get: mocks.obterPlanilha } }),
  lerAbaAutenticado: mocks.lerAba,
}));

const ID = "1aXZqYWNer-ZcF9G37DAtAU2Jr40H7XPUN1pEQuPFXng";
const GID = "94296670";
const CAB = ["ID Remessa", "Data", "Horário", "Mês", "Processo Encaminhado", "ID do E-mail"];

const linha = (data: string, proc: string, email: string) => ["1", data, "10:00", "x", proc, email];
const abasDoGoogle = (...titulos: string[]) => ({
  data: { sheets: titulos.map((title) => ({ properties: { title } })) },
});
const csv = (corpo: string) =>
  new Response(corpo, { status: 200, headers: { "content-type": "text/csv; charset=utf-8" } });

/** Duas abas de ano, no formato da planilha. */
function abas(): Record<string, string[][]> {
  return {
    "Remessas 2025": [
      CAB,
      linha("10/03/2025", "Geral Nº 1/2025 - volume 1", "a1"),
      linha("11/03/2025", "Geral Nº 1/2025 - volume 1", "a2"),
    ],
    "Remessas 2026": [
      CAB,
      linha("24/11/2026", "Geral Nº 2/2026 - volume 1", "b1"),
      linha("05/01/2026", "Geral Nº 2/2026 - volume 1", "b2"),
    ],
  };
}

async function carregar() {
  vi.resetModules(); // o cache é estado de módulo (§9.34): cada teste começa com ele zerado
  return (await import("../painelDemanda")).carregarPainelDemanda;
}

describe("carregarPainelDemanda", () => {
  const antes = { id: process.env.DEMANDA_PLANILHA_ID, gid: process.env.DEMANDA_PLANILHA_GID };
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    mocks.findMany.mockReset().mockResolvedValue([]);
    mocks.obterPlanilha.mockReset();
    mocks.lerAba.mockReset();
    process.env.DEMANDA_PLANILHA_ID = ID;
    process.env.DEMANDA_PLANILHA_GID = GID;
  });
  afterEach(() => {
    vi.useRealTimers();
    if (antes.id === undefined) delete process.env.DEMANDA_PLANILHA_ID;
    else process.env.DEMANDA_PLANILHA_ID = antes.id;
    if (antes.gid === undefined) delete process.env.DEMANDA_PLANILHA_GID;
    else process.env.DEMANDA_PLANILHA_GID = antes.gid;
  });

  function comApi(tabelas: Record<string, string[][]>, extras: string[] = []) {
    mocks.obterPlanilha.mockResolvedValue(
      abasDoGoogle("Painel Remessas", ...Object.keys(tabelas), ...extras),
    );
    mocks.lerAba.mockImplementation(async (_id: string, titulo: string) => tabelas[titulo] ?? []);
  }

  it("sem DEMANDA_PLANILHA_ID: não configurada; id inválido: indisponível, e nada é lido", async () => {
    delete process.env.DEMANDA_PLANILHA_ID;
    expect(await (await carregar())()).toEqual({ estado: "nao_configurada" });
    process.env.DEMANDA_PLANILHA_ID = "../x";
    expect(await (await carregar())()).toMatchObject({ estado: "indisponivel" });
    expect(mocks.obterPlanilha).not.toHaveBeenCalled();
  });

  it("gid inválido nunca chega ao Google", async () => {
    process.env.DEMANDA_PLANILHA_GID = "94296670&x=1";
    expect(await (await carregar())()).toMatchObject({
      estado: "indisponivel",
      motivo: expect.stringContaining("DEMANDA_PLANILHA_GID"),
    });
    expect(mocks.obterPlanilha).not.toHaveBeenCalled();
  });

  it("pela API: abre cada aba 'Remessas <ano>' pelo NOME e junta os anos (última camada: o que vai ao Google)", async () => {
    comApi(abas(), ["Remessas Extraídas (backup 24-11 0904)", "Calc_Dashboards"]);
    const r = await (await carregar())();
    expect(mocks.obterPlanilha).toHaveBeenCalledWith({
      spreadsheetId: ID,
      fields: "sheets.properties.title",
    });
    // só as abas de ano: nem o painel, nem o backup, nem o Calc
    expect(mocks.lerAba.mock.calls).toEqual([
      [ID, "Remessas 2025"],
      [ID, "Remessas 2026"],
    ]);
    expect(r).toMatchObject({ estado: "ok", fonte: "api", aviso: null, anos: [2026, 2025] });
    if (r.estado !== "ok") return;
    expect(r.painel.ano).toBe(2026);
    expect(r.painel.hoje).toBe("2026-11-24");
    expect(r.painel.atual.remessas).toBe(2);
    expect(r.painel.anterior!.remessas).toBe(2); // o ano anterior só aparece por causa da API
  });

  it("o seletor de ano: ano pedido que existe é usado; o que não existe cai no mais recente", async () => {
    comApi(abas());
    const carregarPainel = await carregar();
    const a = await carregarPainel({ ano: 2025 });
    const b = await carregarPainel({ ano: 1999 });
    expect(a.estado === "ok" && a.painel.ano).toBe(2025);
    expect(b.estado === "ok" && b.painel.ano).toBe(2026);
  });

  it("repassa a categoria ao painel", async () => {
    comApi(abas());
    const r = await (await carregar())({ categoria: "bens" });
    expect(r.estado === "ok" && r.painel.atual.remessas).toBe(0);
    expect(r.estado === "ok" && r.painel.categoria).toBe("bens");
  });

  it("a mesma remessa vista em duas abas conta UMA vez e entra em 'duplicadas'", async () => {
    const t = abas();
    t["Remessas 2026"]!.push(linha("11/03/2025", "Geral Nº 1/2025 - volume 1", "a2")); // repete a2 de 2025
    comApi(t);
    const r = await (await carregar())();
    expect(r.estado === "ok" && r.duplicadas).toBe(1);
    expect(r.estado === "ok" && r.painel.anterior!.remessas).toBe(2);
  });

  it("sem acesso pela API: usa o CSV público da aba configurada, SEM comparativo, e avisa", async () => {
    mocks.obterPlanilha.mockRejectedValue(new Error("403"));
    const f = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        csv([CAB.join(","), "1,24/11/2026,10:00,x,Geral Nº 2/2026 - volume 1,b1"].join("\n")),
      );
    const r = await (await carregar())();
    expect(f.mock.calls[0]![0]).toBe(
      `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=${GID}`,
    );
    expect(r).toMatchObject({ estado: "ok", fonte: "csv", anos: [2026] });
    if (r.estado !== "ok") return;
    expect(r.aviso).toContain("sem comparativo");
    expect(r.painel.anterior).toBeNull();
  });

  it("API sem nenhuma aba 'Remessas <ano>' (planilha antiga): também cai no CSV e explica o motivo", async () => {
    mocks.obterPlanilha.mockResolvedValue(abasDoGoogle("Remessas Extraídas", "Painel Remessas"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      csv([CAB.join(","), "1,24/11/2026,10:00,x,Geral Nº 2/2026 - volume 1,b1"].join("\n")),
    );
    const r = await (await carregar())();
    expect(r.estado === "ok" && r.fonte).toBe("csv");
    expect(r.estado === "ok" && r.aviso).toContain("Remessas <ano>");
    expect(mocks.lerAba).not.toHaveBeenCalled();
  });

  it("falha de CONTEÚDO não usa a reserva: aba de ano com cabeçalho irreconhecível = indisponível, com o nome da aba", async () => {
    comApi({
      ...abas(),
      "Remessas 2024": [
        ["a", "b"],
        ["x", "y"],
      ],
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await (await carregar())();
    expect(r).toMatchObject({
      estado: "indisponivel",
      motivo: expect.stringContaining("Remessas 2024"),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("API e CSV falham: indisponível com o motivo do CSV, nunca zero processos", async () => {
    mocks.obterPlanilha.mockRejectedValue(new Error("boom"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x", { status: 403 }));
    const r = await (await carregar())();
    expect(r).toEqual({ estado: "indisponivel", motivo: expect.stringContaining("link público") });
  });

  it("planilha sem nenhuma remessa válida: indisponível, não painel vazio", async () => {
    comApi({ "Remessas 2026": [CAB] });
    expect(await (await carregar())()).toEqual({
      estado: "indisponivel",
      motivo: expect.stringContaining("remessas válidas"),
    });
  });

  it("cache de 1 hora: a segunda leitura não vai ao Google; passada a hora, vai", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T12:00:00Z"));
    comApi(abas());
    const carregarPainel = await carregar();
    await carregarPainel();
    await carregarPainel({ ano: 2025 }); // outro ano, mesma planilha: reaproveita a leitura
    expect(mocks.obterPlanilha).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-11-24T12:59:00Z"));
    await carregarPainel();
    expect(mocks.obterPlanilha).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-11-24T13:00:00Z")); // exatamente 1 hora: já venceu
    await carregarPainel();
    expect(mocks.obterPlanilha).toHaveBeenCalledTimes(2);
  });

  it("duas telas pedindo ao mesmo tempo disparam UMA leitura", async () => {
    comApi(abas());
    const carregarPainel = await carregar();
    await Promise.all([carregarPainel(), carregarPainel(), carregarPainel()]);
    expect(mocks.obterPlanilha).toHaveBeenCalledTimes(1);
  });

  it("falha não fica em cache: a leitura seguinte tenta de novo", async () => {
    mocks.obterPlanilha.mockRejectedValue(new Error("boom"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x", { status: 500 }));
    const carregarPainel = await carregar();
    expect((await carregarPainel()).estado).toBe("indisponivel");
    comApi(abas());
    expect((await carregarPainel()).estado).toBe("ok");
  });

  it("junta os processos cadastrados no sistema (para o link) e a falha do cadastro não derruba o painel", async () => {
    comApi(abas());
    mocks.findMany.mockResolvedValue([{ id: "p1", numero: "0002/2026" }]);
    const r = await (await carregar())();
    expect(r.estado === "ok" && r.noSistema).toEqual({
      "2/2026": { id: "p1", numero: "0002/2026" },
    });
    mocks.findMany.mockRejectedValue(new Error("db"));
    const r2 = await (await carregar())();
    expect(r2.estado === "ok" && r2.noSistema).toEqual({});
  });
});
