import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { registrarMarcosProcesso, registrarRespostaCotacao } from "../marcos";

function txCom(contagens: number[]) {
  return {
    precoConsolidado: {
      groupBy: vi.fn().mockResolvedValue(
        contagens.map((n, i) => ({ seriePrecoId: `s${i}`, _count: { _all: n } })),
      ),
    },
    processo: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    cotacao: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

const AGORA = new Date("2026-11-16T15:00:00.000Z");

describe("registrarMarcosProcesso", () => {
  it("conta só preços incluídos do próprio processo", async () => {
    const tx = txCom([1]);
    await registrarMarcosProcesso(tx as never, "proc-1", AGORA);

    expect(tx.precoConsolidado.groupBy).toHaveBeenCalledWith({
      by: ["seriePrecoId"],
      where: { status: "incluido", seriePreco: { item: { processoId: "proc-1" } } },
      _count: { _all: true },
    });
  });

  it("grava a primeira referência só se ainda nula (guarda atômica no where)", async () => {
    const tx = txCom([1]);
    await registrarMarcosProcesso(tx as never, "proc-1", AGORA);

    expect(tx.processo.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.processo.updateMany).toHaveBeenCalledWith({
      where: { id: "proc-1", primeiraReferenciaEm: null },
      data: { primeiraReferenciaEm: AGORA },
    });
  });

  it("grava a série mínima quando um item chega a 3, também só se nula", async () => {
    const tx = txCom([1, 3]);
    await registrarMarcosProcesso(tx as never, "proc-1", AGORA);

    expect(tx.processo.updateMany).toHaveBeenCalledWith({
      where: { id: "proc-1", serieMinimaEm: null },
      data: { serieMinimaEm: AGORA },
    });
  });

  it("sem preço incluído não escreve nada", async () => {
    const tx = txCom([]);
    await registrarMarcosProcesso(tx as never, "proc-1", AGORA);

    expect(tx.processo.updateMany).not.toHaveBeenCalled();
  });
});

describe("registrarRespostaCotacao", () => {
  it("grava a data de resposta só se ainda nula", async () => {
    const tx = txCom([]);
    await registrarRespostaCotacao(tx as never, "cot-1", AGORA);

    expect(tx.cotacao.updateMany).toHaveBeenCalledWith({
      where: { id: "cot-1", dataResposta: null },
      data: { dataResposta: AGORA },
    });
  });
});
