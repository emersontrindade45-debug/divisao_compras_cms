import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  ligada: vi.fn(),
  aplicar: vi.fn(),
}));
vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/emailCotacao/aplicarIa", () => ({
  aplicacaoIaLigada: mocks.ligada,
  aplicarAprovadasPendentes: mocks.aplicar,
}));

import { aplicarAprovadasPelaIa } from "../aplicarAprovadasIa";

describe("aplicarAprovadasPelaIa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "u1" });
    mocks.ligada.mockReturnValue(true);
    mocks.aplicar.mockResolvedValue({ aplicadas: 5, ignoradas: 0, restantes: 0 });
  });

  it("exige papel de pesquisa", async () => {
    mocks.requireRole.mockRejectedValue(new Error("negado"));
    await expect(aplicarAprovadasPelaIa()).rejects.toThrow("negado");
    expect(mocks.aplicar).not.toHaveBeenCalled();
  });

  it("chave desligada: erro e nenhuma aplicação", async () => {
    mocks.ligada.mockReturnValue(false);
    expect((await aplicarAprovadasPelaIa()).error).toMatch(/desligada/);
    expect(mocks.aplicar).not.toHaveBeenCalled();
  });

  it("aplica em nome do usuário e atualiza as telas", async () => {
    const r = await aplicarAprovadasPelaIa();
    expect(r.data?.aplicadas).toBe(5);
    expect(mocks.aplicar).toHaveBeenCalledWith("u1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cotacoes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });
});
