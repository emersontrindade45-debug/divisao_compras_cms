import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  buscar: vi.fn(),
  ligar: vi.fn(),
}));

vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/emailCotacao/ligarRespostaFornecedor", () => ({
  buscarCandidatosDoEnvio: mocks.buscar,
  ligarRespostaAConsulta: mocks.ligar,
}));

import { buscarFornecedoresDoEnvio, ligarRespostaAoFornecedor } from "../ligarRespostaFornecedor";

const CONSULTA = "ckqut11d0000abcdefghijklm";

describe("buscarFornecedoresDoEnvio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "u1" });
    mocks.buscar.mockResolvedValue([]);
  });

  it("exige o papel de pesquisa antes de qualquer coisa", async () => {
    mocks.requireRole.mockRejectedValue(new Error("negado"));
    await expect(buscarFornecedoresDoEnvio({ gmailMensagemId: "m1" })).rejects.toThrow("negado");
    expect(mocks.buscar).not.toHaveBeenCalled();
  });

  it.each([{}, { gmailMensagemId: "" }, { gmailMensagemId: "m1", termo: "x".repeat(101) }, null])("entrada inválida: %j", async (e) => {
    expect((await buscarFornecedoresDoEnvio(e)).error).toBe("Dados inválidos.");
    expect(mocks.buscar).not.toHaveBeenCalled();
  });

  it("o termo é opcional e o cliente NÃO escolhe o envio (só a mensagem)", async () => {
    await buscarFornecedoresDoEnvio({ gmailMensagemId: "m1", envioId: "outro" });
    expect(mocks.buscar).toHaveBeenCalledWith("m1", "");
  });

  it("resposta inexistente vira erro", async () => {
    mocks.buscar.mockResolvedValue(null);
    expect((await buscarFornecedoresDoEnvio({ gmailMensagemId: "m1" })).error).toBe("Resposta não encontrada.");
  });
});

describe("ligarRespostaAoFornecedor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "u1" });
    mocks.ligar.mockResolvedValue({ tipo: "ligada", aplicada: true, situacao: "recusa" });
  });

  it("exige o papel de pesquisa antes de qualquer coisa", async () => {
    mocks.requireRole.mockRejectedValue(new Error("negado"));
    await expect(ligarRespostaAoFornecedor({ gmailMensagemId: "m1", consultaId: CONSULTA })).rejects.toThrow("negado");
    expect(mocks.ligar).not.toHaveBeenCalled();
    expect(mocks.requireRole).toHaveBeenCalledWith("pesquisa");
  });

  it.each([{}, { gmailMensagemId: "m1" }, { gmailMensagemId: "m1", consultaId: "nao-e-cuid" }, { consultaId: CONSULTA }, null])(
    "entrada inválida: %j",
    async (e) => {
      expect((await ligarRespostaAoFornecedor(e)).error).toBe("Dados inválidos.");
      expect(mocks.ligar).not.toHaveBeenCalled();
    },
  );

  it("liga, audita só ids/classe e atualiza as telas", async () => {
    const r = await ligarRespostaAoFornecedor({ gmailMensagemId: "m1", consultaId: CONSULTA });
    expect(r.data).toEqual({ aplicada: true, situacao: "recusa" });
    expect(mocks.ligar).toHaveBeenCalledWith("m1", CONSULTA);
    expect(mocks.registrarAuditoria).toHaveBeenCalledWith({
      userId: "u1",
      acao: "ligar_resposta_fornecedor",
      detalhes: { gmailMensagemId: "m1", consultaId: CONSULTA, aplicada: true, situacao: "recusa" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cotacoes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("erro da ligação: devolve a mensagem e não audita nem revalida", async () => {
    mocks.ligar.mockResolvedValue({ tipo: "erro", mensagem: "Esta resposta já foi ligada." });
    const r = await ligarRespostaAoFornecedor({ gmailMensagemId: "m1", consultaId: CONSULTA });
    expect(r.error).toBe("Esta resposta já foi ligada.");
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
