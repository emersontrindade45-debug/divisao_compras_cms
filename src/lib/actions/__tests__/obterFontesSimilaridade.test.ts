import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { item: { findMany: vi.fn() } },
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ requireAuth: mocks.requireAuth }));

import { obterFontesSimilaridade } from "../listar";

describe("obterFontesSimilaridade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-1", role: "pesquisa" });
    mocks.db.item.findMany.mockResolvedValue([]);
  });

  // Regressão: um candidato descartado pelo usuário não pode voltar a aparecer
  // só porque a query nested de `resultadosSimilaridade` não filtra por ele.
  it("filtra resultados descartados na relação aninhada", async () => {
    await obterFontesSimilaridade("proc-1");

    const argumento = mocks.db.item.findMany.mock.calls[0]![0] as {
      select: { resultadosSimilaridade: { where?: Record<string, unknown> } };
    };

    expect(argumento.select.resultadosSimilaridade.where).toEqual({ descartado: false });
  });
});
