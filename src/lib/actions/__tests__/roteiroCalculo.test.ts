import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    resultadoSimilaridade: { update: vi.fn() },
    fonte: { updateMany: vi.fn() },
    precoConsolidado: { updateMany: vi.fn() },
  };
  const db = {
    item: { findUnique: vi.fn(), update: vi.fn() },
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

import {
  limparRoteiroCalculo,
  salvarParametrosTR,
  salvarRoteiroCalculo,
} from "../roteiroCalculo";

const RESULTADO_ID = "ckqut11d0000abcdefghijklm";
const ITEM_ID = "ckqut11d0000zzzzzzzzzzzzz";

function resultadoBase(overrides: Record<string, unknown> = {}) {
  return {
    id: RESULTADO_ID,
    valorUnitario: 6.89,
    promovidoParaFonte: false,
    item: {
      id: "item-1",
      processoId: "proc-1",
      quantidade: 12,
      unidade: "unidade",
      trMedida: 940,
      trMedidaUnidade: "m²",
      trFrequencia: "semestral",
      trVigenciaMeses: 24,
    },
    ...overrides,
  };
}

const ROTEIRO_UNITARIO_X_TR = {
  valorInicial: 6.89,
  rotuloInicial: "preço do m²",
  unidadeInicial: "m²",
  passos: [
    { operacao: "multiplicacao" as const, origem: "medida_tr" as const },
    { operacao: "multiplicacao" as const, origem: "execucoes_periodo" as const },
  ],
};

describe("salvarRoteiroCalculo", () => {
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

  // Caso 2 do usuário: 6,89 × 940 (medida do TR) × 4 (execuções) = 25.906,40.
  it("reexecuta o roteiro no servidor com os parâmetros do item, e grava o resultado", async () => {
    const res = await salvarRoteiroCalculo({
      resultadoId: RESULTADO_ID,
      roteiro: ROTEIRO_UNITARIO_X_TR,
      periodicidade: null,
    });

    expect(res.data).toEqual({ valorConsiderado: 25906.4 });
    expect(mocks.tx.resultadoSimilaridade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RESULTADO_ID },
        data: expect.objectContaining({
          valorConsiderado: 25906.4,
          roteiroCalculo: expect.objectContaining({ valorInicial: 6.89 }),
        }),
      }),
    );
  });

  // Um valor final mandado pelo cliente não teria como ser conferido — a
  // action precisa recalcular, não confiar no número que chegou.
  it("ignora qualquer 'valor final' que não seja o resultado do próprio roteiro", async () => {
    // Roteiro sem passos: resultado tem de ser o próprio valorInicial (6,89),
    // não um número diferente que um cliente malicioso tentasse mandar junto.
    const res = await salvarRoteiroCalculo({
      resultadoId: RESULTADO_ID,
      roteiro: { valorInicial: 6.89, passos: [] },
      periodicidade: null,
    });

    expect(res.data).toEqual({ valorConsiderado: 6.89 });
  });

  it("não toca em Fonte nem na série quando o candidato não foi promovido", async () => {
    await salvarRoteiroCalculo({
      resultadoId: RESULTADO_ID,
      roteiro: ROTEIRO_UNITARIO_X_TR,
      periodicidade: null,
    });

    expect(mocks.tx.fonte.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.precoConsolidado.updateMany).not.toHaveBeenCalled();
  });

  it("propaga o valor para Fonte e série quando já promovido, na mesma transação", async () => {
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(
      resultadoBase({ promovidoParaFonte: true }),
    );

    await salvarRoteiroCalculo({
      resultadoId: RESULTADO_ID,
      roteiro: ROTEIRO_UNITARIO_X_TR,
      periodicidade: null,
    });

    expect(mocks.tx.fonte.updateMany).toHaveBeenCalledWith({
      where: { resultadoSimilaridadeId: RESULTADO_ID },
      data: { valorUnitario: 25906.4 },
    });
    expect(mocks.tx.precoConsolidado.updateMany).toHaveBeenCalledWith({
      where: { resultadoSimilaridadeId: RESULTADO_ID },
      data: { valorUnitario: 25906.4 },
    });
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1);
  });

  // Sem a medida do TR, o passo `medida_tr` não tem operando — recusar antes
  // de escrever qualquer coisa.
  it("recusa quando o item não tem os parâmetros exigidos pelo roteiro", async () => {
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(
      resultadoBase({ item: { ...resultadoBase().item, trMedida: null } }),
    );

    const res = await salvarRoteiroCalculo({
      resultadoId: RESULTADO_ID,
      roteiro: ROTEIRO_UNITARIO_X_TR,
      periodicidade: null,
    });

    expect(res.error).toBeDefined();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("retorna erro quando o candidato não existe", async () => {
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(null);

    const res = await salvarRoteiroCalculo({
      resultadoId: RESULTADO_ID,
      roteiro: ROTEIRO_UNITARIO_X_TR,
      periodicidade: null,
    });

    expect(res.error).toBe("Candidato não encontrado");
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  // §9.46: select explícito, sem as colunas do M13, para funcionar antes e
  // depois de qualquer migration futura sobre esse model.
  it("consulta com select explícito, sem include", async () => {
    await salvarRoteiroCalculo({
      resultadoId: RESULTADO_ID,
      roteiro: ROTEIRO_UNITARIO_X_TR,
      periodicidade: null,
    });

    const argumento = mocks.db.resultadoSimilaridade.findUnique.mock.calls[0]![0] as {
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    };
    expect(argumento.include).toBeUndefined();
    expect(argumento.select).toBeDefined();
  });

  it("audita com a grandeza do resultado e o roteiro completo", async () => {
    await salvarRoteiroCalculo({
      resultadoId: RESULTADO_ID,
      roteiro: ROTEIRO_UNITARIO_X_TR,
      periodicidade: null,
    });

    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: "salvar_roteiro_calculo_candidato",
        detalhes: expect.objectContaining({
          grandeza: "escopo_tr_periodo",
          valorConsiderado: 25906.4,
        }),
      }),
    );
  });
});

describe("limparRoteiroCalculo", () => {
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

  it("zera o roteiro e o valor considerado", async () => {
    const res = await limparRoteiroCalculo(RESULTADO_ID);

    expect(res.data).toEqual({ valorUnitario: 6.89 });
    expect(mocks.tx.resultadoSimilaridade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ valorConsiderado: null }),
      }),
    );
  });

  it("restaura o valor publicado pela fonte na série quando já promovido", async () => {
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(
      resultadoBase({ promovidoParaFonte: true }),
    );

    await limparRoteiroCalculo(RESULTADO_ID);

    expect(mocks.tx.fonte.updateMany).toHaveBeenCalledWith({
      where: { resultadoSimilaridadeId: RESULTADO_ID },
      data: { valorUnitario: 6.89 },
    });
  });
});

describe("salvarParametrosTR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "user-1", role: "pesquisa" });
    mocks.db.item.findUnique.mockResolvedValue({ id: ITEM_ID, processoId: "proc-1" });
    mocks.db.item.update.mockResolvedValue({ id: ITEM_ID });
  });

  it("grava medida, frequência e vigência do item", async () => {
    const res = await salvarParametrosTR({
      itemId: ITEM_ID,
      medida: 940,
      medidaUnidade: "m²",
      frequencia: "semestral",
      vigenciaMeses: 24,
    });

    expect(res.data).toEqual({ itemId: ITEM_ID });
    expect(mocks.db.item.update).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: {
        trMedida: 940,
        trMedidaUnidade: "m²",
        trFrequencia: "semestral",
        trVigenciaMeses: 24,
      },
    });
  });

  it("aceita limpar os parâmetros com null", async () => {
    await salvarParametrosTR({
      itemId: ITEM_ID,
      medida: null,
      medidaUnidade: null,
      frequencia: null,
      vigenciaMeses: null,
    });

    expect(mocks.db.item.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          trMedida: null,
          trMedidaUnidade: null,
          trFrequencia: null,
          trVigenciaMeses: null,
        },
      }),
    );
  });

  it("rejeita vigência acima de 120 meses (erro de digitação, não contrato)", async () => {
    const res = await salvarParametrosTR({
      itemId: ITEM_ID,
      medida: null,
      medidaUnidade: null,
      frequencia: null,
      vigenciaMeses: 999,
    });

    expect(res.error).toBeDefined();
    expect(mocks.db.item.update).not.toHaveBeenCalled();
  });

  it("retorna erro quando o item não existe", async () => {
    mocks.db.item.findUnique.mockResolvedValue(null);

    const res = await salvarParametrosTR({
      itemId: ITEM_ID,
      medida: 940,
      medidaUnidade: null,
      frequencia: null,
      vigenciaMeses: null,
    });

    expect(res.error).toBe("Item não encontrado");
  });
});
