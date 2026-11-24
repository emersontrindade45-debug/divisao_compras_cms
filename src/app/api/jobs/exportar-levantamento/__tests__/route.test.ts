import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findAudit: vi.fn(),
  exportar: vi.fn(),
  planilha: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.findUser }, auditLog: { findFirst: mocks.findAudit } } }));
vi.mock("@/lib/levantamento/exportarPlanilha", () => ({ exportarLevantamento: mocks.exportar, planilhaDoLevantamento: mocks.planilha }));

import { GET, PAUSA_MINIMA_MS } from "../route";

const SEGREDO = "s3gredo-longo-de-teste";
const RESULTADO = {
  ano: 2026, envios: 275, consultas: 17804, linhasConsultas: 1100, releituraOk: true,
  verificacoes: [{ nome: "Soma dos desfechos = consultas registradas", resultado: "OK", detalhe: "x" }],
};
const chamar = (auth: string | null = `Bearer ${SEGREDO}`) =>
  GET(new Request("https://x.test/api/jobs/exportar-levantamento", { headers: auth ? { authorization: auth } : {} }));

describe("GET /api/jobs/exportar-levantamento", () => {
  const original = { s: process.env.CRON_SECRET, u: process.env.CRON_USUARIO_EMAIL };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SEGREDO;
    process.env.CRON_USUARIO_EMAIL = "sistema@automacao.local";
    mocks.planilha.mockReturnValue("id-da-planilha");
    mocks.findUser.mockResolvedValue({ id: "u-sistema" });
    mocks.findAudit.mockResolvedValue(null);
    mocks.exportar.mockResolvedValue(RESULTADO);
  });
  afterEach(() => {
    if (original.s === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original.s;
    if (original.u === undefined) delete process.env.CRON_USUARIO_EMAIL; else process.env.CRON_USUARIO_EMAIL = original.u;
  });

  it.each([[null], ["Bearer errado"], ["Bearer undefined"]])("sem autorização (%s): 401 e nada é lido nem escrito", async (auth) => {
    expect((await chamar(auth)).status).toBe(401);
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.exportar).not.toHaveBeenCalled();
  });

  it("sem CRON_SECRET a rota fica FECHADA, mesmo com cabeçalho (§9.45)", async () => {
    delete process.env.CRON_SECRET;
    expect((await chamar("Bearer undefined")).status).toBe(401);
    expect(mocks.exportar).not.toHaveBeenCalled();
  });

  it("planilha não configurada: 503 e nada é feito", async () => {
    mocks.planilha.mockReturnValue(null);
    expect((await chamar()).status).toBe(503);
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.exportar).not.toHaveBeenCalled();
  });

  it("sem usuário de sistema: 503, e a exportação não é atribuída a ninguém", async () => {
    delete process.env.CRON_USUARIO_EMAIL;
    expect((await chamar()).status).toBe(503);
    expect(mocks.exportar).not.toHaveBeenCalled();
  });

  it("pausa de 10 min: exportação recente = pula sem escrever, e a consulta da pausa usa a ação certa", async () => {
    mocks.findAudit.mockResolvedValue({ id: "a1" });
    expect(await (await chamar()).json()).toEqual({ ok: true, pulou: "recente" });
    expect(mocks.exportar).not.toHaveBeenCalled();
    const arg = mocks.findAudit.mock.calls[0]![0] as { where: { acao: string; createdAt: { gte: Date } } };
    expect(arg.where.acao).toBe("exportar_levantamento_planilha");
    const idade = Date.now() - arg.where.createdAt.gte.getTime();
    expect(idade).toBeGreaterThanOrEqual(PAUSA_MINIMA_MS - 1000);
    expect(idade).toBeLessThanOrEqual(PAUSA_MINIMA_MS + 5000);
    expect(PAUSA_MINIMA_MS).toBe(600_000);
  });

  it("exporta como o usuário de sistema e devolve só contagens e o veredito", async () => {
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, resumo: RESULTADO, divergentes: [] });
    expect(mocks.exportar).toHaveBeenCalledWith("u-sistema");
  });

  it("releitura que não bate: 502 (o gatilho do Google avisa o dono)", async () => {
    mocks.exportar.mockResolvedValue({ ...RESULTADO, releituraOk: false });
    expect((await chamar()).status).toBe(502);
  });

  it("conferência que DIVERGE: 502 e a rota nomeia qual", async () => {
    mocks.exportar.mockResolvedValue({
      ...RESULTADO,
      verificacoes: [{ nome: "Envios × abas do Gmail (Lev_Envios)", resultado: "DIVERGE", detalhe: "274 × 275" }],
    });
    const r = await chamar();
    expect(r.status).toBe(502);
    expect((await r.json()).divergentes).toEqual(["Envios × abas do Gmail (Lev_Envios)"]);
  });

  it("'NÃO CONFERIDO' não derruba a rota (aba do Gmail ausente não é falha da plataforma)", async () => {
    mocks.exportar.mockResolvedValue({
      ...RESULTADO,
      verificacoes: [{ nome: "Envios × abas do Gmail (Lev_Envios)", resultado: "NÃO CONFERIDO", detalhe: "x" }],
    });
    expect((await chamar()).status).toBe(200);
  });

  it("falha externa: 502 com texto FIXO — a mensagem crua (que pode ter dado de e-mail) não vaza", async () => {
    mocks.exportar.mockRejectedValue(new Error("The caller does not have permission: segredo@x.com"));
    const r = await chamar();
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ erro: "A exportação falhou." });
  });

  it("a falha de proteção do nosso código (leitura vazia) é dita por extenso", async () => {
    mocks.exportar.mockRejectedValue(new Error("A leitura das consultas voltou vazia com envios no banco: a planilha NÃO foi alterada."));
    const r = await chamar();
    expect((await r.json()).erro).toMatch(/NÃO foi alterada/);
  });
});
