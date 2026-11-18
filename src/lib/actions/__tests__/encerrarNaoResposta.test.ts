import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  encerrar: vi.fn(),
}));
vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/emailCotacao/encerrarNaoResposta", () => ({ encerrarNaoRespostaEmLote: mocks.encerrar }));

import { encerrarNaoRespostaSemFornecedor } from "../encerrarNaoResposta";

describe("encerrarNaoRespostaSemFornecedor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "u1" });
    mocks.encerrar.mockResolvedValue({ ids: ["p1", "p2"], encerradas: 2 });
  });

  it("exige papel de pesquisa", async () => {
    mocks.requireRole.mockRejectedValue(new Error("negado"));
    await expect(encerrarNaoRespostaSemFornecedor()).rejects.toThrow("negado");
    expect(mocks.encerrar).not.toHaveBeenCalled();
  });

  it("encerra, audita por usuário (contagem e ids internos) e atualiza a tela", async () => {
    const r = await encerrarNaoRespostaSemFornecedor();
    expect(r.data).toEqual({ encerradas: 2 });
    expect(mocks.registrarAuditoria).toHaveBeenCalledWith({
      userId: "u1",
      acao: "encerrar_nao_resposta_lote",
      detalhes: { encerradas: 2, pendenteIds: ["p1", "p2"] },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cotacoes");
  });

  it("nada encerrado: não audita nem revalida", async () => {
    mocks.encerrar.mockResolvedValue({ ids: [], encerradas: 0 });
    expect((await encerrarNaoRespostaSemFornecedor()).data).toEqual({ encerradas: 0 });
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
