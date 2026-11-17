import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { item: { findMany: vi.fn() } },
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ requireAuth: mocks.requireAuth }));
// O módulo do assistente importa muita coisa de servidor que este teste não exercita.
vi.mock("@/lib/actions/../assistente/ferramentas", () => ({}));

import { listarItensDoProcesso } from "../assistente";

describe("listarItensDoProcesso", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-1", role: "pesquisa" });
  });

  it("pede os itens na ordem do TR, com a coluna `ordem`, e devolve o número de cada um", async () => {
    mocks.db.item.findMany.mockResolvedValue([
      { id: "a", descricao: "Controle de pragas", ordem: 1 },
      { id: "c", descricao: "Limpeza", ordem: 3 },
    ]);

    const lista = await listarItensDoProcesso("proc-1");

    const arg = mocks.db.item.findMany.mock.calls[0]![0] as { orderBy: unknown; select: Record<string, boolean> };
    expect(arg.orderBy).toEqual([
      { ordem: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
      { id: "asc" },
    ]);
    expect(arg.select.ordem).toBe(true);
    // O número é o do TR, não a posição: sem o item 2, o 3 continua 3.
    expect(lista).toEqual([
      { id: "a", descricao: "Controle de pragas", numero: 1 },
      { id: "c", descricao: "Limpeza", numero: 3 },
    ]);
  });

  it("item sem ordem usa a posição na lista", async () => {
    mocks.db.item.findMany.mockResolvedValue([
      { id: "a", descricao: "A", ordem: 1 },
      { id: "p", descricao: "Preservado", ordem: null },
    ]);
    const lista = await listarItensDoProcesso("proc-1");
    expect(lista.map((i) => i.numero)).toEqual([1, 2]);
  });
});
