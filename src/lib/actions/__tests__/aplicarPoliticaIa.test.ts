import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), revalidatePath: vi.fn(), aplicar: vi.fn() }));

vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/emailCotacao/politicaIa", () => ({ aplicarPoliticaIa: mocks.aplicar }));

import { aplicarPoliticaIa } from "../aplicarPoliticaIa";

describe("aplicarPoliticaIa (ação)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "u1" });
    mocks.aplicar.mockResolvedValue({ desligada: false, aplicadas: 3, porClasse: { recusa: 2, duvida: 1 }, ignoradas: 0, restantes: 0 });
  });

  it("exige o papel de pesquisa antes de qualquer coisa", async () => {
    mocks.requireRole.mockRejectedValue(new Error("negado"));
    await expect(aplicarPoliticaIa()).rejects.toThrow("negado");
    expect(mocks.aplicar).not.toHaveBeenCalled();
  });

  it("aplica com o usuário da sessão e atualiza as telas", async () => {
    const r = await aplicarPoliticaIa();
    expect(mocks.aplicar).toHaveBeenCalledWith("u1");
    expect(r.data?.aplicadas).toBe(3);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cotacoes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("chave desligada vira erro claro e não revalida nada", async () => {
    mocks.aplicar.mockResolvedValue({ desligada: true, aplicadas: 0, porClasse: { recusa: 0, duvida: 0 }, ignoradas: 0, restantes: 0 });
    const r = await aplicarPoliticaIa();
    expect(r.error).toBe("A aplicação automática da IA está desligada.");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
