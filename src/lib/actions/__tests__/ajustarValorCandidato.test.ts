import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    resultadoSimilaridade: { update: vi.fn() },
    fonte: { updateMany: vi.fn() },
    precoConsolidado: { updateMany: vi.fn() },
  };
  const db = {
    resultadoSimilaridade: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    tx,
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

import { ajustarValorCandidato, limparAjusteValorCandidato } from "../ajustarValorCandidato";

const RESULTADO_ID = "ckqut11d0000abcdefghijklm";

function resultadoBase(overrides: Record<string, unknown> = {}) {
  return {
    id: RESULTADO_ID,
    valorUnitario: 15000,
    promovidoParaFonte: false,
    item: { id: "item-1", processoId: "proc-1" },
    ...overrides,
  };
}

const ENTRADA_VALIDA = {
  resultadoId: RESULTADO_ID,
  valorBase: 15000,
  operacao: "divisao" as const,
  quantidade: 150,
  unidadeMedida: "m²",
  quantidadeTR: 940,
  periodicidade: "meses_12" as const,
  baseSerie: "unitario" as const,
};

describe("ajustarValorCandidato", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "user-1", role: "pesquisa" });
    mocks.db.$transaction.mockImplementation(async (fn: (t: typeof mocks.tx) => unknown) =>
      fn(mocks.tx),
    );
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(resultadoBase());
    mocks.tx.resultadoSimilaridade.update.mockResolvedValue({ id: RESULTADO_ID });
    mocks.tx.fonte.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.precoConsolidado.updateMany.mockResolvedValue({ count: 1 });
  });

  it("grava o valor unitário calculado junto com os operandos da conta", async () => {
    const res = await ajustarValorCandidato(ENTRADA_VALIDA);

    expect(res.data).toEqual({ valorConsiderado: 100 });
    expect(mocks.tx.resultadoSimilaridade.update).toHaveBeenCalledWith({
      where: { id: RESULTADO_ID },
      data: {
        ajusteValorBase: 15000,
        ajusteOperacao: "divisao",
        ajusteQuantidade: 150,
        ajusteUnidadeMedida: "m²",
        ajusteQuantidadeTR: 940,
        ajustePeriodicidade: "meses_12",
        valorUnitarioAjustado: 100,
        ajusteBaseSerie: "unitario",
        valorConsiderado: 100,
      },
    });
  });

  // Candidato ainda não promovido não tem Fonte nem linha na série — escrever
  // ali criaria preço sem promoção.
  it("não toca em Fonte nem na série quando o candidato não foi promovido", async () => {
    await ajustarValorCandidato(ENTRADA_VALIDA);

    expect(mocks.tx.fonte.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.precoConsolidado.updateMany).not.toHaveBeenCalled();
  });

  // Sem esta propagação, o candidato mostraria R$ 100,00 na tela enquanto a
  // estimativa seguiria com os R$ 15.000,00 promovidos antes do ajuste.
  it("propaga o novo valor para a Fonte e para a série quando já promovido", async () => {
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(
      resultadoBase({ promovidoParaFonte: true }),
    );

    await ajustarValorCandidato(ENTRADA_VALIDA);

    expect(mocks.tx.fonte.updateMany).toHaveBeenCalledWith({
      where: { resultadoSimilaridadeId: RESULTADO_ID },
      data: { valorUnitario: 100 },
    });
    expect(mocks.tx.precoConsolidado.updateMany).toHaveBeenCalledWith({
      where: { resultadoSimilaridadeId: RESULTADO_ID },
      data: { valorUnitario: 100 },
    });
  });

  // Candidato, Fonte e série divergirem entre si é estimativa injustificável:
  // as três escritas precisam cair juntas.
  it("faz as três escritas dentro da mesma transação", async () => {
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(
      resultadoBase({ promovidoParaFonte: true }),
    );

    await ajustarValorCandidato(ENTRADA_VALIDA);

    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejeita divisão por zero antes de qualquer escrita", async () => {
    const res = await ajustarValorCandidato({ ...ENTRADA_VALIDA, quantidade: 0 });

    expect(res.error).toBeDefined();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("rejeita operação fora das três admitidas", async () => {
    const res = await ajustarValorCandidato({
      ...ENTRADA_VALIDA,
      operacao: "potencia" as unknown as "soma",
    });

    expect(res.error).toBeDefined();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("normaliza unidade de medida em branco para null", async () => {
    await ajustarValorCandidato({ ...ENTRADA_VALIDA, unidadeMedida: "   " });

    expect(mocks.tx.resultadoSimilaridade.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ajusteUnidadeMedida: null }) }),
    );
  });

  it("retorna erro quando o candidato não existe", async () => {
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(null);

    const res = await ajustarValorCandidato(ENTRADA_VALIDA);

    expect(res.error).toBe("Candidato não encontrado");
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  // Relatado em 2026-08-12: R$ 6,95 x 4500 m² = R$ 31.275,00, e o valor que o
  // analista quer na mediana é esse x 6 (quantidade do TR) = R$ 187.650,00.
  describe("com a projeção do TR escolhida como base", () => {
    const PROJETADO = {
      ...ENTRADA_VALIDA,
      valorBase: 6.95,
      operacao: "multiplicacao" as const,
      quantidade: 4500,
      quantidadeTR: 6,
      baseSerie: "projetado_tr" as const,
    };

    it("grava o valor projetado como o considerado, mantendo o unitário à vista", async () => {
      const res = await ajustarValorCandidato(PROJETADO);

      expect(res.data).toEqual({ valorConsiderado: 187650 });
      expect(mocks.tx.resultadoSimilaridade.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            valorUnitarioAjustado: 31275,
            valorConsiderado: 187650,
            ajusteBaseSerie: "projetado_tr",
          }),
        }),
      );
    });

    it("propaga o valor projetado — não o unitário — para a série", async () => {
      mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(
        resultadoBase({ promovidoParaFonte: true }),
      );

      await ajustarValorCandidato(PROJETADO);

      expect(mocks.tx.precoConsolidado.updateMany).toHaveBeenCalledWith({
        where: { resultadoSimilaridadeId: RESULTADO_ID },
        data: { valorUnitario: 187650 },
      });
    });

    // Gravar o unitário no lugar da projeção seria mandar para a série um
    // número que o analista não escolheu.
    it("recusa a projeção sem quantidade de TR, sem escrever nada", async () => {
      const res = await ajustarValorCandidato({ ...PROJETADO, quantidadeTR: null });

      expect(res.error).toBeDefined();
      expect(mocks.db.$transaction).not.toHaveBeenCalled();
    });
  });

  // §9.46: `select` explícito mantém a action compatível com o banco antes e
  // depois da migration; `include` pediria todas as colunas escalares.
  it("consulta com select explícito, sem as colunas de ajuste", async () => {
    await ajustarValorCandidato(ENTRADA_VALIDA);

    const argumento = mocks.db.resultadoSimilaridade.findUnique.mock.calls[0]![0] as {
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    };

    expect(argumento.include).toBeUndefined();
    expect(argumento.select).toBeDefined();
    for (const coluna of ["ajusteValorBase", "ajusteOperacao", "valorUnitarioAjustado"]) {
      expect(argumento.select).not.toHaveProperty(coluna);
    }
  });

  it("audita o ajuste com o valor antes e depois", async () => {
    await ajustarValorCandidato(ENTRADA_VALIDA);

    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        processoId: "proc-1",
        acao: "ajustar_valor_candidato_similaridade",
        detalhes: expect.objectContaining({
          resultadoId: RESULTADO_ID,
          valorOriginalFonte: 15000,
          valorUnitarioAjustado: 100,
          operacao: "divisao",
          quantidade: 150,
          propagadoParaSerie: false,
        }),
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/processos/proc-1");
  });
});

describe("limparAjusteValorCandidato", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "user-1", role: "pesquisa" });
    mocks.db.$transaction.mockImplementation(async (fn: (t: typeof mocks.tx) => unknown) =>
      fn(mocks.tx),
    );
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(resultadoBase());
    mocks.tx.resultadoSimilaridade.update.mockResolvedValue({ id: RESULTADO_ID });
    mocks.tx.fonte.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.precoConsolidado.updateMany.mockResolvedValue({ count: 1 });
  });

  it("zera todos os campos de ajuste", async () => {
    const res = await limparAjusteValorCandidato(RESULTADO_ID);

    expect(res.data).toEqual({ valorUnitario: 15000 });
    expect(mocks.tx.resultadoSimilaridade.update).toHaveBeenCalledWith({
      where: { id: RESULTADO_ID },
      data: {
        ajusteValorBase: null,
        ajusteOperacao: null,
        ajusteQuantidade: null,
        ajusteUnidadeMedida: null,
        ajusteQuantidadeTR: null,
        ajustePeriodicidade: null,
        valorUnitarioAjustado: null,
        ajusteBaseSerie: null,
        valorConsiderado: null,
      },
    });
  });

  it("restaura o valor publicado pela fonte na série quando já promovido", async () => {
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(
      resultadoBase({ promovidoParaFonte: true }),
    );

    await limparAjusteValorCandidato(RESULTADO_ID);

    expect(mocks.tx.fonte.updateMany).toHaveBeenCalledWith({
      where: { resultadoSimilaridadeId: RESULTADO_ID },
      data: { valorUnitario: 15000 },
    });
    expect(mocks.tx.precoConsolidado.updateMany).toHaveBeenCalledWith({
      where: { resultadoSimilaridadeId: RESULTADO_ID },
      data: { valorUnitario: 15000 },
    });
  });

  it("audita a limpeza do ajuste", async () => {
    await limparAjusteValorCandidato(RESULTADO_ID);

    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: "limpar_ajuste_valor_candidato_similaridade",
        detalhes: expect.objectContaining({ valorRestaurado: 15000 }),
      }),
    );
  });
});
