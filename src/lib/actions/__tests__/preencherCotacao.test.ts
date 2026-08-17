import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    processo: { findUnique: vi.fn() },
    item: { findMany: vi.fn(), findUnique: vi.fn() },
  },
  requireAuth: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  extrairSpreadsheetId: vi.fn(),
  preencherPrecosPublicos: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/sheets/googleSheets", () => ({
  extrairSpreadsheetId: mocks.extrairSpreadsheetId,
}));
vi.mock("@/lib/sheets/preencherPrecosPublicos", () => ({
  preencherPrecosPublicos: mocks.preencherPrecosPublicos,
}));

import { preencherCotacao, sincronizarItemComPlanilha } from "../preencherCotacao";

describe("preencherCotacao", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-1", role: "pesquisa" });
    mocks.db.processo.findUnique.mockResolvedValue({
      id: "proc-1",
      planilhaOrigemUrl: "https://docs.google.com/spreadsheets/d/abc/edit",
    });
    mocks.extrairSpreadsheetId.mockReturnValue("abc");
    mocks.db.item.findMany.mockResolvedValue([
      {
        descricao: "Cadeira giratória",
        resultadosSimilaridade: [
          { valorUnitario: 850.5, valorConsiderado: null },
          { valorUnitario: 910, valorConsiderado: null },
        ],
      },
    ]);
    mocks.preencherPrecosPublicos.mockResolvedValue({
      linhasPreenchidas: 1,
      linhasNaoEncontradas: [],
      abaUtilizada: "Cotação",
    });
  });

  // Regressão de deploy (CLAUDE.md §9.46). Código e migration sobem em tempos
  // diferentes: com `include` em vez de `select`, o Prisma pede todas as colunas
  // escalares de `ResultadoSimilaridade` — inclusive `origem`, `conversaId` e
  // `termoBuscaUsado`, que o M13 acrescentou — e a action quebra em runtime
  // enquanto a migration não foi aplicada. O mesmo defeito já derrubou
  // `promoverFonte` em produção em 2026-07-27; este caminho tinha a mesma falha
  // e nenhum teste.
  it("consulta apenas as colunas que usa, sem as acrescentadas pelo M13", async () => {
    await preencherCotacao("proc-1");

    const argumento = mocks.db.item.findMany.mock.calls[0]![0] as {
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    };

    // `include` traria todos os escalares de volta — é o modo de falha original.
    expect(argumento.include).toBeUndefined();
    expect(argumento.select).toBeDefined();

    const relacao = argumento.select!.resultadosSimilaridade as {
      select?: Record<string, unknown>;
    };
    // A relação aninhada precisa do próprio `select`: sem ele o Prisma volta a
    // pedir todos os escalares do model relacionado, que é onde estão as colunas
    // novas.
    expect(relacao.select).toBeDefined();
    for (const coluna of ["origem", "conversaId", "termoBuscaUsado"]) {
      expect(relacao.select).not.toHaveProperty(coluna);
    }
    expect(relacao.select).toHaveProperty("valorUnitario", true);
  });

  it("envia à planilha só os preços dos candidatos, na ordem de score", async () => {
    await preencherCotacao("proc-1");

    expect(mocks.preencherPrecosPublicos).toHaveBeenCalledWith("abc", [
      { descricao: "Cadeira giratória", precos: [850.5, 910] },
    ]);
  });

  it("usa o valor ajustado pelo roteiro de cálculo, quando existir, no lugar do bruto", async () => {
    mocks.db.item.findMany.mockResolvedValue([
      {
        descricao: "Cadeira giratória",
        resultadosSimilaridade: [
          { valorUnitario: 850.5, valorConsiderado: 1200 },
          { valorUnitario: 910, valorConsiderado: null },
        ],
      },
    ]);

    await preencherCotacao("proc-1");

    expect(mocks.preencherPrecosPublicos).toHaveBeenCalledWith("abc", [
      { descricao: "Cadeira giratória", precos: [1200, 910] },
    ]);
  });

  it("conta como sem candidato o item que não tem resultado nenhum", async () => {
    mocks.db.item.findMany.mockResolvedValue([
      { descricao: "Cadeira giratória", resultadosSimilaridade: [] },
    ]);

    const res = await preencherCotacao("proc-1");

    expect(res.data?.itensSemCandidato).toBe(1);
  });

  it("recusa processo sem planilha de origem, sem tocar nos itens", async () => {
    mocks.db.processo.findUnique.mockResolvedValue({ id: "proc-1", planilhaOrigemUrl: null });

    const res = await preencherCotacao("proc-1");

    expect(res.error).toMatch(/planilha de origem/i);
    expect(mocks.db.item.findMany).not.toHaveBeenCalled();
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("não audita quando a escrita na planilha falha", async () => {
    mocks.preencherPrecosPublicos.mockRejectedValue(new Error("cota do Google excedida"));

    const res = await preencherCotacao("proc-1");

    expect(res.error).toMatch(/cota do Google excedida/);
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("audita o preenchimento com o resultado real da planilha", async () => {
    await preencherCotacao("proc-1");

    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        processoId: "proc-1",
        acao: "preencher_cotacao",
        detalhes: expect.objectContaining({ itensPreenchidos: 1, aba: "Cotação" }),
      }),
    );
  });
});

// Escrita automática de UM item, disparada por `promoverFonte.ts` ao promover
// um candidato — sem exigir o clique manual em "Preencher cotação" depois.
describe("sincronizarItemComPlanilha", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.item.findUnique.mockResolvedValue({
      descricao: "Cadeira giratória",
      processo: { planilhaOrigemUrl: "https://docs.google.com/spreadsheets/d/abc/edit" },
      resultadosSimilaridade: [
        { valorUnitario: 850.5, valorConsiderado: null },
        { valorUnitario: 910, valorConsiderado: null },
      ],
    });
    mocks.extrairSpreadsheetId.mockReturnValue("abc");
    mocks.preencherPrecosPublicos.mockResolvedValue({
      linhasPreenchidas: 1,
      linhasNaoEncontradas: [],
      abaUtilizada: "Cotação",
    });
  });

  it("escreve os preços do item na planilha e reporta sucesso", async () => {
    const res = await sincronizarItemComPlanilha("item-1");

    expect(mocks.preencherPrecosPublicos).toHaveBeenCalledWith("abc", [
      { descricao: "Cadeira giratória", precos: [850.5, 910] },
    ]);
    expect(res).toEqual({ sincronizado: true });
  });

  it("usa o valor ajustado pelo roteiro de cálculo, quando existir, no lugar do bruto", async () => {
    mocks.db.item.findUnique.mockResolvedValue({
      descricao: "Cadeira giratória",
      processo: { planilhaOrigemUrl: "https://docs.google.com/spreadsheets/d/abc/edit" },
      resultadosSimilaridade: [{ valorUnitario: 850.5, valorConsiderado: 25906.4 }],
    });

    await sincronizarItemComPlanilha("item-1");

    expect(mocks.preencherPrecosPublicos).toHaveBeenCalledWith("abc", [
      { descricao: "Cadeira giratória", precos: [25906.4] },
    ]);
  });

  it("não sincroniza (e não lança) quando o processo não tem planilha vinculada", async () => {
    mocks.db.item.findUnique.mockResolvedValue({
      descricao: "Cadeira giratória",
      processo: { planilhaOrigemUrl: null },
      resultadosSimilaridade: [{ valorUnitario: 850.5 }],
    });

    const res = await sincronizarItemComPlanilha("item-1");

    expect(res.sincronizado).toBe(false);
    expect(res.motivo).toMatch(/planilha de origem/i);
    expect(mocks.preencherPrecosPublicos).not.toHaveBeenCalled();
  });

  it("não sincroniza quando o item não tem nenhum candidato de preço", async () => {
    mocks.db.item.findUnique.mockResolvedValue({
      descricao: "Cadeira giratória",
      processo: { planilhaOrigemUrl: "https://docs.google.com/spreadsheets/d/abc/edit" },
      resultadosSimilaridade: [],
    });

    const res = await sincronizarItemComPlanilha("item-1");

    expect(res.sincronizado).toBe(false);
    expect(mocks.preencherPrecosPublicos).not.toHaveBeenCalled();
  });

  it("reporta falha sem lançar quando a escrita na planilha rejeita", async () => {
    mocks.preencherPrecosPublicos.mockRejectedValue(new Error("cota do Google excedida"));

    const res = await sincronizarItemComPlanilha("item-1");

    expect(res).toEqual({ sincronizado: false, motivo: "cota do Google excedida" });
  });

  it("reporta falha sem lançar quando a consulta ao banco falha", async () => {
    mocks.db.item.findUnique.mockRejectedValue(new Error("conexão perdida"));

    const res = await sincronizarItemComPlanilha("item-1");

    expect(res).toEqual({ sincronizado: false, motivo: "conexão perdida" });
  });
});
