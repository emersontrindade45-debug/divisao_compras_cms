import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  registrar: vi.fn(),
}));

vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/emailCotacao/conferenciaIa", () => ({ registrarConferencia: mocks.registrar }));

import { conferirClassificacaoIa } from "../conferirClassificacaoIa";

describe("conferirClassificacaoIa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "u1" });
    mocks.registrar.mockResolvedValue({ tipo: "ok", certa: false, classeIa: "recusa" });
  });

  it("exige o papel de pesquisa antes de qualquer coisa", async () => {
    mocks.requireRole.mockRejectedValue(new Error("negado"));
    await expect(conferirClassificacaoIa({ gmailMensagemId: "m1", classeCorreta: "recusa" })).rejects.toThrow("negado");
    expect(mocks.registrar).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { gmailMensagemId: "", classeCorreta: "recusa" },
    { gmailMensagemId: "m1", classeCorreta: "qualquer" },
    { gmailMensagemId: "m1" },
    null,
  ])("entrada inválida: %j", async (e) => {
    expect((await conferirClassificacaoIa(e)).error).toBe("Dados inválidos.");
    expect(mocks.registrar).not.toHaveBeenCalled();
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("grava com o usuário da sessão (o cliente não escolhe quem conferiu) e audita só ids e classes", async () => {
    const r = await conferirClassificacaoIa({ gmailMensagemId: "m1", classeCorreta: "duvida", userId: "outro" });
    expect(r).toEqual({ data: { certa: false, classeIa: "recusa" } });
    expect(mocks.registrar).toHaveBeenCalledWith("m1", "duvida", "u1");
    expect(mocks.registrarAuditoria).toHaveBeenCalledWith({
      userId: "u1",
      acao: "conferir_classificacao_ia",
      detalhes: { gmailMensagemId: "m1", classeIa: "recusa", classeCorreta: "duvida", certa: false },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cotacoes");
  });

  it("classificação não encontrada: erro, sem auditoria", async () => {
    mocks.registrar.mockResolvedValue({ tipo: "erro", mensagem: "Classificação não encontrada." });
    expect((await conferirClassificacaoIa({ gmailMensagemId: "m1", classeCorreta: "recusa" })).error).toBe(
      "Classificação não encontrada.",
    );
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("falha do banco (ex.: tabela ainda não migrada) vira mensagem, sem auditoria nem exceção", async () => {
    mocks.registrar.mockRejectedValue(new Error("relation does not exist"));
    const r = await conferirClassificacaoIa({ gmailMensagemId: "m1", classeCorreta: "recusa" });
    expect(r.error).toMatch(/Não foi possível gravar/);
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });
});
