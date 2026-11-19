import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  lote: vi.fn(),
}));
vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/emailCotacao/classificarSemFornecedor", () => ({ classificarSemFornecedorEmLote: mocks.lote }));

import { classificarSemFornecedorPelaIa } from "../classificarSemFornecedor";

describe("classificarSemFornecedorPelaIa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "u1" });
    mocks.lote.mockResolvedValue({ alvos: [], feitas: [{ pendenteId: "p1", gmailMensagemId: "m1", classe: "recusa" }], blocosComFalha: 0 });
  });

  it("exige papel de pesquisa", async () => {
    mocks.requireRole.mockRejectedValue(new Error("negado"));
    await expect(classificarSemFornecedorPelaIa()).rejects.toThrow("negado");
    expect(mocks.lote).not.toHaveBeenCalled();
  });

  it("classifica, audita só contagem e ids internos e atualiza cotações e dashboard", async () => {
    const r = await classificarSemFornecedorPelaIa();
    expect(r.data).toEqual({ classificadas: 1, blocosComFalha: 0 });
    expect(mocks.registrarAuditoria).toHaveBeenCalledWith({
      userId: "u1",
      acao: "classificar_sem_fornecedor_lote",
      detalhes: { classificadas: 1, pendenteIds: ["p1"] },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cotacoes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("blocos com falha são informados, e o que foi feito é auditado", async () => {
    mocks.lote.mockResolvedValue({ alvos: [], feitas: [{ pendenteId: "p1", gmailMensagemId: "m1", classe: "recusa" }], blocosComFalha: 2 });
    expect((await classificarSemFornecedorPelaIa()).data).toEqual({ classificadas: 1, blocosComFalha: 2 });
    expect(mocks.registrarAuditoria).toHaveBeenCalledTimes(1);
  });

  it("nada classificado: não audita nem revalida", async () => {
    mocks.lote.mockResolvedValue({ alvos: [], feitas: [], blocosComFalha: 0 });
    expect((await classificarSemFornecedorPelaIa()).data).toEqual({ classificadas: 0, blocosComFalha: 0 });
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
