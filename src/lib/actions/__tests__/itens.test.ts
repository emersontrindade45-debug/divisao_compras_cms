import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    item: { findUnique: vi.fn(), update: vi.fn() },
  };
  return {
    db,
    requireRole: vi.fn(),
    registrarAuditoria: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { atualizarNaturezaItem } from "../itens";

const ITEM_ID = "ckqut11d0000abcdefghijklm";

function itemBase(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    processoId: "proc-1",
    natureza: null,
    ...overrides,
  };
}

describe("atualizarNaturezaItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({
      id: "user-1",
      role: "pesquisa",
      email: "u@e.com",
      name: "Usuário",
    });
    mocks.db.item.findUnique.mockResolvedValue(itemBase());
    mocks.db.item.update.mockResolvedValue({});
  });

  it("grava a natureza informada e revalida a rota do processo", async () => {
    const res = await atualizarNaturezaItem(ITEM_ID, "bem_consumo");

    expect(res.data).toEqual({ itemId: ITEM_ID });
    expect(mocks.db.item.update).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { natureza: "bem_consumo" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/processos/proc-1");
  });

  it("aceita null para limpar a classificação (item volta a usar o teto de 730 dias)", async () => {
    mocks.db.item.findUnique.mockResolvedValue(itemBase({ natureza: "servico_continuo" }));

    const res = await atualizarNaturezaItem(ITEM_ID, null);

    expect(res.data).toEqual({ itemId: ITEM_ID });
    expect(mocks.db.item.update).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { natureza: null },
    });
  });

  it("registra auditoria com o valor anterior e o novo", async () => {
    mocks.db.item.findUnique.mockResolvedValue(itemBase({ natureza: "bem_consumo" }));

    await atualizarNaturezaItem(ITEM_ID, "servico_continuo");

    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        processoId: "proc-1",
        acao: "atualizar_natureza_item",
        detalhes: expect.objectContaining({
          itemId: ITEM_ID,
          de: "bem_consumo",
          para: "servico_continuo",
        }),
      }),
    );
  });

  it("rejeita valor fora do enum (mutação: garante que a validação Zod está mesmo em vigor)", async () => {
    const res = await atualizarNaturezaItem(ITEM_ID, "invalido" as never);

    expect(res.error).toBeDefined();
    expect(mocks.db.item.update).not.toHaveBeenCalled();
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("retorna erro quando o item não existe", async () => {
    mocks.db.item.findUnique.mockResolvedValue(null);

    const res = await atualizarNaturezaItem(ITEM_ID, "bem_consumo");

    expect(res.error).toBe("Item não encontrado");
    expect(mocks.db.item.update).not.toHaveBeenCalled();
  });
});
