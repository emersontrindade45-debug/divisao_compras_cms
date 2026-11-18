import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  findConsulta: vi.fn(),
  updateMany: vi.fn(),
  findIa: vi.fn(),
}));

vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({
  db: {
    consultaCotacao: { findUnique: mocks.findConsulta, updateMany: mocks.updateMany },
    classificacaoIaResposta: { findUnique: mocks.findIa },
  },
}));

import { revisarOrcamentoPorPdf } from "../revisarOrcamentoPdf";

const ID = "ckqut11d0000abcdefghijklm";
const consulta = { situacao: "orcamento", regra: "anexo_orcamento", gmailRespostaId: "m1" };

describe("revisarOrcamentoPorPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "u1" });
    mocks.findConsulta.mockResolvedValue(consulta);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findIa.mockResolvedValue({ classeIa: "recusa" });
  });

  it("exige papel de pesquisa", async () => {
    mocks.requireRole.mockRejectedValue(new Error("negado"));
    await expect(revisarOrcamentoPorPdf({ consultaId: ID, decisao: "manter" })).rejects.toThrow("negado");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("recusa entrada inválida", async () => {
    expect((await revisarOrcamentoPorPdf({ consultaId: "x", decisao: "manter" })).error).toBe("Dados inválidos.");
    expect((await revisarOrcamentoPorPdf({ consultaId: ID, decisao: "apagar" })).error).toBe("Dados inválidos.");
  });

  it("manter: vira decisão manual, com a guarda de estado no where", async () => {
    const r = await revisarOrcamentoPorPdf({ consultaId: ID, decisao: "manter" });
    expect(r.data).toEqual({ situacao: "orcamento" });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: ID,
        situacao: "orcamento",
        regra: { in: ["anexo_orcamento", "anexo_orcamento_dominio"] },
        gmailRespostaId: "m1",
      },
      data: { regra: "manual" },
    });
  });

  it.each([
    ["recusa", { situacao: "recusa", regra: "manual" }],
    ["duvida", { situacao: "duvida", regra: "manual" }],
    ["nao_e_resposta", { situacao: "sem_resposta", dataResposta: null, gmailRespostaId: null, regra: null }],
  ])("rebaixar segue a classe da IA lida do banco (%s)", async (classeIa, data) => {
    mocks.findIa.mockResolvedValue({ classeIa });
    const r = await revisarOrcamentoPorPdf({ consultaId: ID, decisao: "rebaixar" });
    expect(r.error).toBeUndefined();
    expect(mocks.updateMany.mock.calls[0][0].data).toEqual(data);
    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "revisar_orcamento_pdf", detalhes: expect.objectContaining({ classeIa }) }),
    );
  });

  it("rebaixar não age se a IA concorda com orçamento ou não há classificação", async () => {
    mocks.findIa.mockResolvedValue({ classeIa: "orcamento" });
    expect((await revisarOrcamentoPorPdf({ consultaId: ID, decisao: "rebaixar" })).error).toMatch(/não discorda/);
    mocks.findIa.mockResolvedValue(null);
    expect((await revisarOrcamentoPorPdf({ consultaId: ID, decisao: "rebaixar" })).error).toMatch(/não discorda/);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...consulta, situacao: "recusa" }],
    [{ ...consulta, regra: "manual" }],
    [{ ...consulta, regra: "ia" }],
    [{ ...consulta, gmailRespostaId: null }],
    [null],
  ])("não toca consulta fora do alvo: %j", async (c) => {
    mocks.findConsulta.mockResolvedValue(c);
    const r = await revisarOrcamentoPorPdf({ consultaId: ID, decisao: "rebaixar" });
    expect(r.error).toMatch(/já foi revisada/);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("decisão concorrente (count 0): não audita nem revalida", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const r = await revisarOrcamentoPorPdf({ consultaId: ID, decisao: "rebaixar" });
    expect(r.error).toMatch(/já foi revisada/);
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
