import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findAudit: vi.fn(),
  executar: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.findUser }, auditLog: { findFirst: mocks.findAudit } } }));
vi.mock("@/lib/emailCotacao/verificar", () => ({ executarVerificacao: mocks.executar }));

import { GET, PAUSA_MINIMA_MS } from "../route";

const SEGREDO = "s3gredo-longo-de-teste";
const RESUMO = {
  envios: 1, enviosNovos: 0, consultasNovas: 0, respostasClassificadas: 0,
  respostasNaFila: 0, emailsInvalidos: 0, enviosSemProcesso: 0,
};
const chamar = (auth: string | null = `Bearer ${SEGREDO}`) =>
  GET(new Request("https://x.test/api/jobs/verificar-respostas", { headers: auth ? { authorization: auth } : {} }));

describe("GET /api/jobs/verificar-respostas", () => {
  const original = { s: process.env.CRON_SECRET, u: process.env.CRON_USUARIO_EMAIL };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SEGREDO;
    process.env.CRON_USUARIO_EMAIL = "Sistema@Automacao.Local ";
    mocks.findUser.mockResolvedValue({ id: "u-sistema" });
    mocks.findAudit.mockResolvedValue(null);
    mocks.executar.mockResolvedValue({ data: RESUMO });
  });
  afterEach(() => {
    if (original.s === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original.s;
    if (original.u === undefined) delete process.env.CRON_USUARIO_EMAIL; else process.env.CRON_USUARIO_EMAIL = original.u;
  });

  it.each([[null], ["Bearer errado"], ["Bearer undefined"]])("sem autorização (%s): 401 e NADA é consultado nem executado", async (auth) => {
    expect((await chamar(auth)).status).toBe(401);
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.findAudit).not.toHaveBeenCalled();
    expect(mocks.executar).not.toHaveBeenCalled();
  });

  it("sem CRON_SECRET configurado a rota fica FECHADA, mesmo com cabeçalho (§9.45)", async () => {
    delete process.env.CRON_SECRET;
    expect((await chamar("Bearer undefined")).status).toBe(401);
    expect(mocks.executar).not.toHaveBeenCalled();
  });

  it("sem usuário de sistema configurado: 503, e a ação NÃO é atribuída a ninguém", async () => {
    delete process.env.CRON_USUARIO_EMAIL;
    const r = await chamar();
    expect(r.status).toBe(503);
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.executar).not.toHaveBeenCalled();
  });

  it("usuário de sistema inexistente no banco: 503", async () => {
    mocks.findUser.mockResolvedValue(null);
    expect((await chamar()).status).toBe(503);
    expect(mocks.executar).not.toHaveBeenCalled();
  });

  it("procura o usuário pelo e-mail normalizado (minúsculo, sem espaços) e só pelo id", async () => {
    await chamar();
    expect(mocks.findUser).toHaveBeenCalledWith({ where: { email: "sistema@automacao.local" }, select: { id: true } });
  });

  it("pausa mínima: verificação nos últimos 10 min (qualquer origem) = pula, sem executar", async () => {
    mocks.findAudit.mockResolvedValue({ id: "a1" });
    const r = await chamar();
    expect(await r.json()).toEqual({ ok: true, pulou: "recente" });
    expect(mocks.executar).not.toHaveBeenCalled();
    // A consulta da pausa: a ação certa e a janela de 10 minutos (última camada observável).
    const arg = mocks.findAudit.mock.calls[0]![0] as { where: { acao: string; createdAt: { gte: Date } } };
    expect(arg.where.acao).toBe("verificar_respostas_email");
    const idade = Date.now() - arg.where.createdAt.gte.getTime();
    expect(idade).toBeGreaterThanOrEqual(PAUSA_MINIMA_MS - 1000);
    expect(idade).toBeLessThanOrEqual(PAUSA_MINIMA_MS + 5000);
    expect(PAUSA_MINIMA_MS).toBe(600_000);
  });

  it("executa como o usuário de sistema, marcada como automática, e devolve só as contagens", async () => {
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, resumo: RESUMO });
    expect(mocks.executar).toHaveBeenCalledWith({ userId: "u-sistema", inicioEm: expect.any(Number), origem: "automatica" });
  });

  it("falha da verificação: 502 com o texto fixo dela (para o gatilho do Google acusar a falha)", async () => {
    mocks.executar.mockResolvedValue({ error: "O Google recusou a leitura. Tente novamente em instantes." });
    const r = await chamar();
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ erro: "O Google recusou a leitura. Tente novamente em instantes." });
  });
});
