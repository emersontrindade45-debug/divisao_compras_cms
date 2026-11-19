import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    respostaEmailPendente: { updateMany: vi.fn() },
    classificacaoIaResposta: { updateMany: vi.fn() },
  };
  return {
    tx,
    db: {
      respostaEmailPendente: { findMany: vi.fn() },
      classificacaoIaResposta: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));

import {
  classificarSemFornecedorEmLote,
  listarClassificaveisSemFornecedor,
  OPCOES_TRANSACAO,
  RESPOSTAS_POR_TRANSACAO,
} from "../classificarSemFornecedor";

describe("classificar respostas sem fornecedor pela IA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.respostaEmailPendente.findMany.mockResolvedValue([
      { id: "p1", gmailMensagemId: "m1" },
      { id: "p2", gmailMensagemId: "m2" },
    ]);
    mocks.db.classificacaoIaResposta.findMany.mockResolvedValue([
      { gmailMensagemId: "m1", classeIa: "recusa" },
      { gmailMensagemId: "m2", classeIa: "orcamento" },
    ]);
    mocks.tx.respostaEmailPendente.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.classificacaoIaResposta.updateMany.mockResolvedValue({ count: 1 });
  });

  it("só pendente aberta, sem fornecedor, dos 3 motivos", async () => {
    await listarClassificaveisSemFornecedor();
    expect(mocks.db.respostaEmailPendente.findMany.mock.calls[0][0].where).toEqual({
      resolvidaEm: null,
      sugestaoConsultaId: null,
      motivo: { in: ["remetente_desconhecido", "dominio_ambiguo", "dominio_generico"] },
    });
  });

  it("só orçamento, recusa e dúvida, com confiança ALTA, ainda não aplicadas nem desfeitas", async () => {
    await listarClassificaveisSemFornecedor();
    expect(mocks.db.classificacaoIaResposta.findMany.mock.calls[0][0].where).toEqual({
      gmailMensagemId: { in: ["m1", "m2"] },
      classeIa: { in: ["orcamento", "recusa", "duvida"] },
      confianca: "alta",
      aplicadaEm: null,
      desfeitaEm: null,
    });
  });

  it("devolve a classe lida pela IA de cada resposta", async () => {
    expect(await listarClassificaveisSemFornecedor()).toEqual([
      { pendenteId: "p1", gmailMensagemId: "m1", classe: "recusa" },
      { pendenteId: "p2", gmailMensagemId: "m2", classe: "orcamento" },
    ]);
  });

  it("fecha a fila com guarda (resolvidaEm null) e só então marca a linha da IA, sem tocar consulta", async () => {
    const r = await classificarSemFornecedorEmLote();
    expect(r.feitas).toHaveLength(2);
    expect(mocks.tx.respostaEmailPendente.updateMany.mock.calls[0][0].where).toEqual({ id: "p1", resolvidaEm: null });
    expect(mocks.tx.classificacaoIaResposta.updateMany.mock.calls[0][0].where).toEqual({
      gmailMensagemId: "m1",
      aplicadaEm: null,
      desfeitaEm: null,
    });
    expect(Object.keys(mocks.tx.classificacaoIaResposta.updateMany.mock.calls[0][0].data)).toEqual(["aplicadaEm"]);
  });

  it("resposta que o analista resolveu no meio-tempo não é classificada nem contada (e a IA não é marcada)", async () => {
    mocks.tx.respostaEmailPendente.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 1 });
    const r = await classificarSemFornecedorEmLote();
    expect(r.feitas.map((f) => f.gmailMensagemId)).toEqual(["m2"]);
    expect(mocks.tx.classificacaoIaResposta.updateMany).toHaveBeenCalledTimes(1);
  });

  it("se a linha da IA mudou, a fila é reaberta: nada fica fechado sem classificação", async () => {
    mocks.tx.classificacaoIaResposta.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 1 });
    const r = await classificarSemFornecedorEmLote();
    expect(r.feitas.map((f) => f.gmailMensagemId)).toEqual(["m2"]);
    expect(mocks.tx.respostaEmailPendente.updateMany.mock.calls[1][0]).toEqual({
      where: { id: "p1" },
      data: { resolvidaEm: null },
    });
  });

  it("sem alvos não abre transação", async () => {
    mocks.db.respostaEmailPendente.findMany.mockResolvedValue([]);
    expect((await classificarSemFornecedorEmLote()).feitas).toEqual([]);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  describe("transação (o botão dava erro e não gravava nada: 25 por bloco estourava os 5 s do Prisma)", () => {
    const muitos = (n: number) => ({
      pend: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, gmailMensagemId: `m${i}` })),
      ia: Array.from({ length: n }, (_, i) => ({ gmailMensagemId: `m${i}`, classeIa: "recusa" })),
    });

    it("blocos pequenos, com prazo explícito acima do padrão de 5 s", async () => {
      const { pend, ia } = muitos(25);
      mocks.db.respostaEmailPendente.findMany.mockResolvedValue(pend);
      mocks.db.classificacaoIaResposta.findMany.mockResolvedValue(ia);
      await classificarSemFornecedorEmLote();
      expect(RESPOSTAS_POR_TRANSACAO).toBeLessThanOrEqual(10);
      expect(mocks.db.$transaction).toHaveBeenCalledTimes(Math.ceil(25 / RESPOSTAS_POR_TRANSACAO));
      expect(mocks.db.$transaction.mock.calls[0][1]).toEqual(OPCOES_TRANSACAO);
      expect(OPCOES_TRANSACAO.timeout).toBeGreaterThan(5_000);
    });

    it("um bloco que falha NÃO derruba os demais, e só o que foi confirmado conta como feito", async () => {
      const { pend, ia } = muitos(25);
      mocks.db.respostaEmailPendente.findMany.mockResolvedValue(pend);
      mocks.db.classificacaoIaResposta.findMany.mockResolvedValue(ia);
      mocks.db.$transaction
        .mockImplementationOnce(async () => {
          throw new Error("Transaction already closed");
        })
        .mockImplementation(async (fn: (t: typeof mocks.tx) => unknown) => fn(mocks.tx));
      const r = await classificarSemFornecedorEmLote();
      expect(r.blocosComFalha).toBe(1);
      expect(r.feitas).toHaveLength(25 - RESPOSTAS_POR_TRANSACAO);
      expect(r.feitas.map((f) => f.pendenteId)).not.toContain("p0");
    });

    it("transação que lança DEPOIS de rodar o corpo não deixa o bloco marcado como feito", async () => {
      const { pend, ia } = muitos(3);
      mocks.db.respostaEmailPendente.findMany.mockResolvedValue(pend);
      mocks.db.classificacaoIaResposta.findMany.mockResolvedValue(ia);
      mocks.db.$transaction.mockImplementationOnce(async (fn: (t: typeof mocks.tx) => unknown) => {
        await fn(mocks.tx);
        throw new Error("commit falhou");
      });
      const r = await classificarSemFornecedorEmLote();
      expect(r.feitas).toEqual([]);
      expect(r.blocosComFalha).toBe(1);
    });
  });
});
