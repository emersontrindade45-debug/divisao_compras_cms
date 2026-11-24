import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUser: vi.fn(), audit: vi.fn(), coletar: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.findUser }, auditLog: { create: mocks.audit } } }));
vi.mock("@/lib/emailCotacao/exemplosIa", () => ({ coletarExemplos: mocks.coletar }));

import { GET } from "../route";

const SEGREDO = "s3gredo-longo-de-teste";
const RES = { decisoes: 5, jaTinham: 3, pedidos: 2, gravados: 2, atualizados: 0, rejeitados: {}, semTexto: 0, restantes: 0, removidos: 0 };
const chamar = (auth: string | null = `Bearer ${SEGREDO}`) =>
  GET(new Request("https://x.test/api/jobs/coletar-exemplos", { headers: auth ? { authorization: auth } : {} }));

describe("GET /api/jobs/coletar-exemplos", () => {
  const original = { s: process.env.CRON_SECRET, u: process.env.CRON_USUARIO_EMAIL };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SEGREDO;
    process.env.CRON_USUARIO_EMAIL = "sistema@automacao.local";
    mocks.findUser.mockResolvedValue({ id: "u-sistema" });
    mocks.coletar.mockResolvedValue({ ok: true, resultado: RES });
    mocks.audit.mockResolvedValue({});
  });
  afterEach(() => {
    if (original.s === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original.s;
    if (original.u === undefined) delete process.env.CRON_USUARIO_EMAIL; else process.env.CRON_USUARIO_EMAIL = original.u;
  });

  it.each([[null], ["Bearer errado"], ["Bearer undefined"]])("sem autorização (%s): 401 e nada é lido nem coletado", async (auth) => {
    expect((await chamar(auth)).status).toBe(401);
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.coletar).not.toHaveBeenCalled();
  });

  it("sem CRON_SECRET a rota fica FECHADA, mesmo com cabeçalho (§9.45)", async () => {
    delete process.env.CRON_SECRET;
    expect((await chamar("Bearer undefined")).status).toBe(401);
    expect(mocks.coletar).not.toHaveBeenCalled();
  });

  it("sem usuário de sistema: 503 e nada é coletado", async () => {
    delete process.env.CRON_USUARIO_EMAIL;
    expect((await chamar()).status).toBe(503);
    expect(mocks.coletar).not.toHaveBeenCalled();
  });

  it("coleta e devolve só contagens; audita como automática, atribuída ao usuário de sistema", async () => {
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, resumo: RES });
    expect(mocks.audit).toHaveBeenCalledWith({ data: { userId: "u-sistema", acao: "coletar_exemplos_ia", detalhes: { origem: "automatica", ...RES } } });
  });

  it("rodada sem nada novo não enche a auditoria", async () => {
    mocks.coletar.mockResolvedValue({ ok: true, resultado: { ...RES, pedidos: 0, gravados: 0, jaTinham: 5 } });
    expect((await chamar()).status).toBe(200);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("falha da coleta: 502 com o texto fixo dela", async () => {
    mocks.coletar.mockResolvedValue({ ok: false, erro: "O Google recusou a leitura dos casos." });
    const r = await chamar();
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ erro: "O Google recusou a leitura dos casos." });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
