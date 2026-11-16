import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    cotacao: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
  registrarRespostaCotacao: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole, requireAuth: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("@/lib/indicadores/marcos", () => ({
  registrarRespostaCotacao: mocks.registrarRespostaCotacao,
}));

import { atualizarCotacao } from "../cotacoes";

describe("atualizarCotacao — data de resposta (M30.0)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "user-1", role: "pesquisa", email: "u@e.com", name: "U" });
    mocks.db.cotacao.findUnique.mockResolvedValue({ id: "cot-1", processoId: "proc-1" });
    mocks.db.$transaction.mockImplementation(async (fn: (tx: typeof mocks.db) => unknown) =>
      fn(mocks.db),
    );
  });

  it.each(["positiva", "negativa", "incompleta"])(
    "status %s registra a resposta na mesma transação",
    async (status) => {
      await atualizarCotacao("cot-1", { status });

      expect(mocks.db.cotacao.update).toHaveBeenCalledWith({
        where: { id: "cot-1" },
        data: { status },
      });
      expect(mocks.registrarRespostaCotacao).toHaveBeenCalledWith(mocks.db, "cot-1");
    },
  );

  it("voltar para silenciosa não registra resposta", async () => {
    await atualizarCotacao("cot-1", { status: "silenciosa" });

    expect(mocks.registrarRespostaCotacao).not.toHaveBeenCalled();
  });
});
