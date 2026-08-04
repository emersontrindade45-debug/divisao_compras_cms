import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    resultadoSimilaridade: { findUnique: vi.fn(), updateMany: vi.fn() },
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

import { descartarResultadoSimilaridade } from "../descartarResultadoSimilaridade";

const RESULTADO_ID = "ckqut11d0000abcdefghijklm";

function resultadoBase(overrides: Record<string, unknown> = {}) {
  return {
    id: RESULTADO_ID,
    promovidoParaFonte: false,
    descartado: false,
    item: { id: "item-1", processoId: "proc-1" },
    ...overrides,
  };
}

describe("descartarResultadoSimilaridade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({
      id: "user-1",
      role: "pesquisa",
      email: "u@e.com",
      name: "Usuário",
    });
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(resultadoBase());
    mocks.db.resultadoSimilaridade.updateMany.mockResolvedValue({ count: 1 });
  });

  it("marca o candidato como descartado com guarda atômica (updateMany condicional)", async () => {
    const res = await descartarResultadoSimilaridade(RESULTADO_ID);

    expect(res.data).toEqual({ resultadoId: RESULTADO_ID });
    expect(mocks.db.resultadoSimilaridade.updateMany).toHaveBeenCalledWith({
      where: { id: RESULTADO_ID, promovidoParaFonte: false, descartado: false },
      data: { descartado: true },
    });
  });

  it("registra auditoria e revalida a rota do processo", async () => {
    await descartarResultadoSimilaridade(RESULTADO_ID);

    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        processoId: "proc-1",
        acao: "descartar_resultado_similaridade",
        detalhes: expect.objectContaining({ resultadoId: RESULTADO_ID, itemId: "item-1" }),
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/processos/proc-1");
  });

  it("recusa descartar candidato já promovido e não escreve nada", async () => {
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(
      resultadoBase({ promovidoParaFonte: true }),
    );

    const res = await descartarResultadoSimilaridade(RESULTADO_ID);

    expect(res.error).toMatch(/já promovido/i);
    expect(mocks.db.resultadoSimilaridade.updateMany).not.toHaveBeenCalled();
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("é idempotente quando o candidato já está descartado (não escreve, não audita de novo)", async () => {
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(
      resultadoBase({ descartado: true }),
    );

    const res = await descartarResultadoSimilaridade(RESULTADO_ID);

    expect(res.data).toEqual({ resultadoId: RESULTADO_ID });
    expect(mocks.db.resultadoSimilaridade.updateMany).not.toHaveBeenCalled();
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("aborta quando outra requisição promoveu/descartou antes (count === 0)", async () => {
    mocks.db.resultadoSimilaridade.updateMany.mockResolvedValue({ count: 0 });

    const res = await descartarResultadoSimilaridade(RESULTADO_ID);

    expect(res.error).toMatch(/não foi possível descartar/i);
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("retorna erro quando o candidato não existe", async () => {
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(null);

    const res = await descartarResultadoSimilaridade(RESULTADO_ID);

    expect(res.error).toBe("Candidato não encontrado");
    expect(mocks.db.resultadoSimilaridade.updateMany).not.toHaveBeenCalled();
  });

  it("consulta apenas as colunas que usa, com select explícito (não include)", async () => {
    await descartarResultadoSimilaridade(RESULTADO_ID);

    const argumento = mocks.db.resultadoSimilaridade.findUnique.mock.calls[0]![0] as {
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    };

    expect(argumento.include).toBeUndefined();
    expect(argumento.select).toBeDefined();
    for (const coluna of ["promovidoParaFonte", "descartado"]) {
      expect(argumento.select).toHaveProperty(coluna, true);
    }
  });
});
