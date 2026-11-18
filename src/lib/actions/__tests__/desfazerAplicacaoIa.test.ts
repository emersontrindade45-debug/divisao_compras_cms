import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  desfazer: vi.fn(),
}));

vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/emailCotacao/aplicarIa", () => ({ desfazerAplicacaoIa: mocks.desfazer }));

import { desfazerRespostaAplicadaPelaIa } from "../desfazerAplicacaoIa";

describe("desfazerRespostaAplicadaPelaIa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "u1", role: "pesquisa" });
    mocks.desfazer.mockResolvedValue("desfeita");
  });

  it("exige o papel de pesquisa antes de qualquer coisa", async () => {
    mocks.requireRole.mockRejectedValue(new Error("negado"));
    await expect(desfazerRespostaAplicadaPelaIa({ gmailMensagemId: "m1" })).rejects.toThrow("negado");
    expect(mocks.desfazer).not.toHaveBeenCalled();
    expect(mocks.requireRole).toHaveBeenCalledWith("pesquisa");
  });

  it.each([{}, { gmailMensagemId: "" }, { gmailMensagemId: "x".repeat(65) }, null])("entrada inválida é recusada: %j", async (entrada) => {
    expect((await desfazerRespostaAplicadaPelaIa(entrada)).error).toBe("Dados inválidos.");
    expect(mocks.desfazer).not.toHaveBeenCalled();
  });

  it("desfaz, audita por usuário (só o id da mensagem) e atualiza as telas", async () => {
    const r = await desfazerRespostaAplicadaPelaIa({ gmailMensagemId: "m1" });
    expect(r.data).toEqual({ desfeita: true });
    expect(mocks.desfazer).toHaveBeenCalledWith("m1");
    expect(mocks.registrarAuditoria).toHaveBeenCalledWith({
      userId: "u1",
      acao: "ia_desfazer_resposta_email",
      detalhes: { gmailMensagemId: "m1" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cotacoes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("nada a desfazer: devolve erro e não audita nem revalida", async () => {
    mocks.desfazer.mockResolvedValue("nada_a_desfazer");
    const r = await desfazerRespostaAplicadaPelaIa({ gmailMensagemId: "m1" });
    expect(r.error).toMatch(/já foi desfeita|não existe/);
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
