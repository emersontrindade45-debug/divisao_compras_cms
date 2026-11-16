import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    processo: { findUnique: vi.fn(), update: vi.fn() },
  };
  return {
    db,
    requireRole: vi.fn(),
    requireAuth: vi.fn(),
    registrarAuditoria: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({
  requireRole: mocks.requireRole,
  requireAuth: mocks.requireAuth,
}));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { atualizarFaseAndamentoProcesso } from "../processos";

const PROCESSO_ID = "ckqut11d0000abcdefghijklm";

function processoBase(overrides: Record<string, unknown> = {}) {
  return {
    id: PROCESSO_ID,
    faseAndamento: "nao_iniciado",
    ...overrides,
  };
}

describe("atualizarFaseAndamentoProcesso", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({
      id: "user-1",
      role: "pesquisa",
      email: "u@e.com",
      name: "Usuário",
    });
    mocks.db.processo.findUnique.mockResolvedValue(processoBase());
    mocks.db.processo.update.mockResolvedValue({});
  });

  it("grava a fase informada e revalida a listagem e o processo", async () => {
    const res = await atualizarFaseAndamentoProcesso(PROCESSO_ID, "em_andamento");

    expect(res.data).toEqual({ processoId: PROCESSO_ID });
    expect(mocks.db.processo.update).toHaveBeenCalledWith({
      where: { id: PROCESSO_ID },
      data: { faseAndamento: "em_andamento" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/processos");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/processos/${PROCESSO_ID}`);
  });

  it("registra auditoria com a fase anterior e a nova", async () => {
    mocks.db.processo.findUnique.mockResolvedValue(processoBase({ faseAndamento: "em_andamento" }));

    await atualizarFaseAndamentoProcesso(PROCESSO_ID, "concluido");

    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        processoId: PROCESSO_ID,
        acao: "atualizar_fase_andamento_processo",
        detalhes: expect.objectContaining({ de: "em_andamento", para: "concluido" }),
      }),
    );
  });

  it("rejeita valor fora do enum (mutação: garante que a validação Zod está mesmo em vigor)", async () => {
    const res = await atualizarFaseAndamentoProcesso(PROCESSO_ID, "invalido");

    expect(res.error).toBeDefined();
    expect(mocks.db.processo.update).not.toHaveBeenCalled();
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("retorna erro quando o processo não existe", async () => {
    mocks.db.processo.findUnique.mockResolvedValue(null);

    const res = await atualizarFaseAndamentoProcesso(PROCESSO_ID, "concluido");

    expect(res.error).toBe("Processo não encontrado");
    expect(mocks.db.processo.update).not.toHaveBeenCalled();
  });
});

describe("atualizarFaseAndamentoProcesso — motivo do retrabalho (M30.0)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "user-1", role: "pesquisa", email: "u@e.com", name: "U" });
    mocks.db.processo.findUnique.mockResolvedValue(processoBase({ faseAndamento: "concluido" }));
    mocks.db.processo.update.mockResolvedValue({});
  });

  it("recusa ir para em_correcao sem motivo, sem gravar nada", async () => {
    const res = await atualizarFaseAndamentoProcesso(PROCESSO_ID, "em_correcao");

    expect(res.error).toMatch(/motivo/i);
    expect(mocks.db.processo.update).not.toHaveBeenCalled();
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("grava o motivo e se ele é falha documental na auditoria", async () => {
    const res = await atualizarFaseAndamentoProcesso(PROCESSO_ID, "em_correcao", {
      codigo: "evidencia_ausente",
    });

    expect(res.error).toBeUndefined();
    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: "atualizar_fase_andamento_processo",
        detalhes: expect.objectContaining({
          de: "concluido",
          para: "em_correcao",
          motivo: "evidencia_ausente",
          falhaDocumental: true,
        }),
      }),
    );
  });

  it("motivo que não é falha documental fica marcado como tal", async () => {
    await atualizarFaseAndamentoProcesso(PROCESSO_ID, "em_correcao", { codigo: "mudanca_requisitante" });

    const detalhes = mocks.registrarAuditoria.mock.calls[0]![0].detalhes as Record<string, unknown>;
    expect(detalhes.falhaDocumental).toBe(false);
  });

  it("'outro' exige descrição", async () => {
    const res = await atualizarFaseAndamentoProcesso(PROCESSO_ID, "em_correcao", { codigo: "outro" });

    expect(res.error).toMatch(/descreva/i);
    expect(mocks.db.processo.update).not.toHaveBeenCalled();
  });

  it("outras fases não exigem motivo", async () => {
    const res = await atualizarFaseAndamentoProcesso(PROCESSO_ID, "em_andamento");

    expect(res.error).toBeUndefined();
  });
});
