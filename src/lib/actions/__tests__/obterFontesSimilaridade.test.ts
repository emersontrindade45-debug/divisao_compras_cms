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

  // A tela mostrava só 5 contratos por item, depois 10: o candidato seguinte
  // ficava invisível mesmo tendo sido pesquisado e aprovado pelo analista, e
  // nada na tela dizia que faltava linha. Medido em produção em 2026-09-18, com
  // o teto em 10: 6 itens já o estouravam e o maior tinha 25 candidatos ativos.
  // O número vai à mão — importando a constante, a asserção acompanharia uma
  // volta a 10 e passaria verde com a regressão (§9.105).
  it("traz até 100 candidatos por item", async () => {
    await obterFontesSimilaridade("proc-1");

    const argumento = mocks.db.item.findMany.mock.calls[0]![0] as {
      select: { resultadosSimilaridade: { take?: number } };
    };

    expect(argumento.select.resultadosSimilaridade.take).toBe(100);
  });

  // Sem estas colunas no `select`, a tela não teria como exibir o valor
  // corrigido pelo analista nem repopular o formulário de ajuste.
  it("lê as colunas do ajuste manual de valor", async () => {
    await obterFontesSimilaridade("proc-1");

    const argumento = mocks.db.item.findMany.mock.calls[0]![0] as {
      select: { resultadosSimilaridade: { select: Record<string, unknown> } };
    };

    for (const coluna of [
      "ajusteValorBase",
      "ajusteOperacao",
      "ajusteQuantidade",
      "ajusteUnidadeMedida",
      "ajusteQuantidadeTR",
      "ajustePeriodicidade",
      "valorUnitarioAjustado",
    ]) {
      expect(argumento.select.resultadosSimilaridade.select).toHaveProperty(coluna, true);
    }
  });
});
