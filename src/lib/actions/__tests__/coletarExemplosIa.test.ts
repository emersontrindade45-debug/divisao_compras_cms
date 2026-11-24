import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  audit: vi.fn(),
  coletar: vi.fn(),
  apagar: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.audit }));
vi.mock("@/lib/emailCotacao/exemplosIa", () => ({ coletarExemplos: mocks.coletar, apagarTodosOsExemplos: mocks.apagar }));

import { apagarExemplosIa, coletarExemplosIa } from "../coletarExemplosIa";

const RES = { decisoes: 2, jaTinham: 0, pedidos: 2, gravados: 2, atualizados: 0, rejeitados: { email: 1 }, semTexto: 0, restantes: 0, removidos: 0 };

describe("coletarExemplosIa (ação)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "u1" });
    mocks.coletar.mockResolvedValue({ ok: true, resultado: RES });
  });

  it("exige o papel de pesquisa antes de qualquer coisa", async () => {
    mocks.requireRole.mockRejectedValue(new Error("negado"));
    await expect(coletarExemplosIa()).rejects.toThrow();
    expect(mocks.coletar).not.toHaveBeenCalled();
    expect(mocks.requireRole).toHaveBeenCalledWith("pesquisa");
  });

  it("audita só contagens e o nome da regra recusada, nunca texto", async () => {
    const r = await coletarExemplosIa();
    expect(r).toEqual({ data: RES });
    expect(mocks.audit).toHaveBeenCalledWith({ userId: "u1", acao: "coletar_exemplos_ia", detalhes: { origem: "manual", ...RES } });
  });

  it("falha da coleta vira erro e não grava auditoria de sucesso", async () => {
    mocks.coletar.mockResolvedValue({ ok: false, erro: "O Google recusou a leitura dos casos." });
    expect(await coletarExemplosIa()).toEqual({ error: "O Google recusou a leitura dos casos." });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe("apagarExemplosIa (ação)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "u9" });
    mocks.apagar.mockResolvedValue(12);
  });

  it("só o papel mais alto apaga (e nada é apagado antes da checagem)", async () => {
    mocks.requireRole.mockRejectedValue(new Error("negado"));
    await expect(apagarExemplosIa()).rejects.toThrow();
    expect(mocks.requireRole).toHaveBeenCalledWith("aprovacao");
    expect(mocks.apagar).not.toHaveBeenCalled();
  });

  it("apaga tudo, devolve a contagem e audita", async () => {
    expect(await apagarExemplosIa()).toEqual({ data: { apagados: 12 } });
    expect(mocks.audit).toHaveBeenCalledWith({ userId: "u9", acao: "apagar_exemplos_ia", detalhes: { apagados: 12 } });
  });
});
