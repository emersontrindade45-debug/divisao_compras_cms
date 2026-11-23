import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), revalidatePath: vi.fn(), executar: vi.fn() }));

vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/emailCotacao/fechamentoIa", () => ({ executarFechamento: mocks.executar }));

import { fecharPendenciasIa } from "../fecharPendenciasIa";

describe("fecharPendenciasIa (ação)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "u1" });
    mocks.executar.mockResolvedValue({ iaDesligada: false, aplicadas: 2, ignoradas: 0, semFornecedor: 1, fechadasSemAlterar: 3, dispensadas: 4 });
  });

  it("exige o papel de pesquisa antes de qualquer coisa", async () => {
    mocks.requireRole.mockRejectedValue(new Error("negado"));
    await expect(fecharPendenciasIa()).rejects.toThrow("negado");
    expect(mocks.executar).not.toHaveBeenCalled();
  });

  it("executa com o usuário da sessão e atualiza as telas", async () => {
    const r = await fecharPendenciasIa();
    expect(mocks.executar).toHaveBeenCalledWith("u1");
    expect(r.data?.dispensadas).toBe(4);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cotacoes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });
});
