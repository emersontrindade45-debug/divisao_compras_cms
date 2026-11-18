import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    classificacaoIaResposta: { updateMany: vi.fn(), findUnique: vi.fn() },
    respostaEmailPendente: { updateMany: vi.fn() },
    consultaCotacao: { findUnique: vi.fn(), updateMany: vi.fn() },
  };
  return { tx, db: { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { aplicacaoIaLigada, aplicarClassificacaoIa, desfazerAplicacaoIa, REGRA_IA } from "../aplicarIa";

const A = {
  gmailMensagemId: "m1",
  classe: "orcamento" as const,
  consultaId: "c1",
  dataResposta: new Date("2026-10-21T19:54:00Z"),
};

function armar(o: { marca?: number; fila?: number; consulta?: { situacao: string; gmailRespostaId: string | null } | null; data?: number } = {}) {
  const t = mocks.tx;
  t.classificacaoIaResposta.updateMany.mockResolvedValue({ count: 1 });
  t.classificacaoIaResposta.updateMany.mockResolvedValueOnce({ count: o.marca ?? 1 });
  t.respostaEmailPendente.updateMany.mockResolvedValue({ count: o.fila ?? 1 });
  t.consultaCotacao.findUnique.mockResolvedValue(o.consulta === undefined ? { situacao: "a_confirmar", gmailRespostaId: "m1" } : o.consulta);
  t.consultaCotacao.updateMany.mockResolvedValue({ count: 1 });
  t.consultaCotacao.updateMany.mockResolvedValueOnce({ count: 1 });
  if (o.data !== undefined) t.consultaCotacao.updateMany.mockResolvedValueOnce({ count: o.data });
}

describe("aplicacaoIaLigada", () => {
  const original = process.env.IA_APLICAR_AUTOMATICO;
  afterEach(() => {
    if (original === undefined) delete process.env.IA_APLICAR_AUTOMATICO;
    else process.env.IA_APLICAR_AUTOMATICO = original;
  });

  it("ausente = desligada (nega por padrão, CLAUDE.md §9.45)", () => {
    delete process.env.IA_APLICAR_AUTOMATICO;
    expect(aplicacaoIaLigada()).toBe(false);
  });
  it.each(["0", "", "true", "sim", "TRUE"])("só o valor exato '1' liga: %j", (v) => {
    process.env.IA_APLICAR_AUTOMATICO = v;
    expect(aplicacaoIaLigada()).toBe(false);
  });
  it("'1' liga", () => {
    process.env.IA_APLICAR_AUTOMATICO = "1";
    expect(aplicacaoIaLigada()).toBe(true);
  });
});

describe("aplicarClassificacaoIa", () => {
  beforeEach(() => vi.clearAllMocks());

  it("orçamento numa consulta aberta: define situação, regra 'ia' e a mensagem; fila resolvida", async () => {
    armar({ data: 1 });
    expect(await aplicarClassificacaoIa(A)).toBe("aplicada");
    expect(mocks.tx.consultaCotacao.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "c1", situacao: { in: ["sem_resposta", "a_confirmar", "duvida"] } },
      data: { situacao: "orcamento", regra: REGRA_IA, gmailRespostaId: "m1" },
    });
    expect(mocks.tx.respostaEmailPendente.updateMany).toHaveBeenCalledWith({
      where: { gmailMensagemId: "m1", resolvidaEm: null },
      data: { resolvidaEm: expect.any(Date) },
    });
  });

  it("nunca sobrescreve decisão anterior: o UPDATE da consulta só alcança situação ainda aberta", async () => {
    armar();
    await aplicarClassificacaoIa({ ...A, classe: "recusa" });
    const where = mocks.tx.consultaCotacao.updateMany.mock.calls[0]![0].where;
    expect(where.situacao.in).not.toContain("orcamento");
    expect(where.situacao.in).not.toContain("recusa");
  });

  it("a data da resposta só é preenchida se ainda estava vazia, e isso fica registrado para o desfazer", async () => {
    armar({ data: 1 });
    await aplicarClassificacaoIa(A);
    expect(mocks.tx.consultaCotacao.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "c1", dataResposta: null },
      data: { dataResposta: A.dataResposta },
    });
    expect(mocks.tx.classificacaoIaResposta.updateMany).toHaveBeenLastCalledWith({
      where: { gmailMensagemId: "m1" },
      data: { situacaoAnterior: "a_confirmar", dataRespostaDefinida: true },
    });
  });

  it("data que já existia não é marcada como definida pela aplicação", async () => {
    armar({ data: 0 });
    await aplicarClassificacaoIa(A);
    expect(mocks.tx.classificacaoIaResposta.updateMany).toHaveBeenLastCalledWith({
      where: { gmailMensagemId: "m1" },
      data: { situacaoAnterior: "a_confirmar", dataRespostaDefinida: false },
    });
  });

  it("linha já aplicada (ou desfeita) não é aplicada de novo: nada é escrito na fila nem na consulta", async () => {
    armar({ marca: 0 });
    expect(await aplicarClassificacaoIa(A)).toBe("ja_tratada");
    expect(mocks.tx.classificacaoIaResposta.updateMany).toHaveBeenCalledWith({
      where: { gmailMensagemId: "m1", aplicadaEm: null, desfeitaEm: null },
      data: { aplicadaEm: expect.any(Date) },
    });
    expect(mocks.tx.respostaEmailPendente.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.consultaCotacao.updateMany).not.toHaveBeenCalled();
  });

  it("resposta que o analista já resolveu: aborta antes de tocar a consulta", async () => {
    armar({ fila: 0 });
    expect(await aplicarClassificacaoIa(A)).toBe("ja_resolvida");
    expect(mocks.tx.consultaCotacao.updateMany).not.toHaveBeenCalled();
  });

  it("consulta que não existe: aborta sem escrever nela", async () => {
    armar({ consulta: null });
    expect(await aplicarClassificacaoIa(A)).toBe("ja_resolvida");
    expect(mocks.tx.consultaCotacao.updateMany).not.toHaveBeenCalled();
  });

  it("'não é resposta' devolve o fornecedor a 'sem resposta' SÓ se foi esta mensagem que o deixou a confirmar", async () => {
    armar();
    await aplicarClassificacaoIa({ ...A, classe: "nao_e_resposta" });
    expect(mocks.tx.consultaCotacao.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", situacao: "a_confirmar", gmailRespostaId: "m1" },
      data: { situacao: "sem_resposta", dataResposta: null, gmailRespostaId: null, regra: null },
    });
    // nenhuma escrita de situação de orçamento/recusa/dúvida
    expect(mocks.tx.consultaCotacao.updateMany.mock.calls.every((c) => c[0].data.situacao === "sem_resposta")).toBe(true);
  });

  it("erro inesperado do banco não é engolido", async () => {
    armar();
    mocks.tx.consultaCotacao.findUnique.mockRejectedValue(new Error("boom"));
    await expect(aplicarClassificacaoIa(A)).rejects.toThrow("boom");
  });
});

describe("desfazerAplicacaoIa", () => {
  beforeEach(() => vi.clearAllMocks());

  function armarDesfazer(o: { marca?: number; linha?: object | null } = {}) {
    const t = mocks.tx;
    t.classificacaoIaResposta.updateMany.mockResolvedValue({ count: o.marca ?? 1 });
    t.classificacaoIaResposta.findUnique.mockResolvedValue(
      o.linha === undefined
        ? { consultaId: "c1", situacaoAnterior: "a_confirmar", dataRespostaDefinida: true, classeIa: "recusa" }
        : o.linha,
    );
    t.respostaEmailPendente.updateMany.mockResolvedValue({ count: 1 });
    t.consultaCotacao.updateMany.mockResolvedValue({ count: 1 });
  }

  it("sem aplicação ativa para desfazer: não toca em nada", async () => {
    armarDesfazer({ marca: 0 });
    expect(await desfazerAplicacaoIa("m1")).toBe("nada_a_desfazer");
    expect(mocks.tx.classificacaoIaResposta.updateMany).toHaveBeenCalledWith({
      where: { gmailMensagemId: "m1", aplicadaEm: { not: null }, desfeitaEm: null },
      data: { desfeitaEm: expect.any(Date) },
    });
    expect(mocks.tx.respostaEmailPendente.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.consultaCotacao.updateMany).not.toHaveBeenCalled();
  });

  it("reabre a resposta na fila e devolve a consulta ao que era, com a data limpa se foi a aplicação que a pôs", async () => {
    armarDesfazer();
    expect(await desfazerAplicacaoIa("m1")).toBe("desfeita");
    expect(mocks.tx.respostaEmailPendente.updateMany).toHaveBeenCalledWith({
      where: { gmailMensagemId: "m1" },
      data: { resolvidaEm: null },
    });
    expect(mocks.tx.consultaCotacao.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", regra: REGRA_IA, gmailRespostaId: "m1" },
      data: { situacao: "a_confirmar", regra: "sinais_ambiguos", gmailRespostaId: "m1", dataResposta: null },
    });
  });

  it("só restaura a consulta se ela AINDA é o resultado desta aplicação (a decisão mais nova vale)", async () => {
    armarDesfazer();
    await desfazerAplicacaoIa("m1");
    const where = mocks.tx.consultaCotacao.updateMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ regra: "ia", gmailRespostaId: "m1" });
  });

  it("data que já existia antes da aplicação não é apagada", async () => {
    armarDesfazer({ linha: { consultaId: "c1", situacaoAnterior: "sem_resposta", dataRespostaDefinida: false, classeIa: "orcamento" } });
    await desfazerAplicacaoIa("m1");
    const data = mocks.tx.consultaCotacao.updateMany.mock.calls[0]![0].data;
    expect(data).not.toHaveProperty("dataResposta");
    expect(data).toMatchObject({ situacao: "sem_resposta", regra: null, gmailRespostaId: null });
  });

  it("desfazer um 'não é resposta' põe o fornecedor de volta a 'a confirmar' só se ele ainda está sem resposta", async () => {
    armarDesfazer({ linha: { consultaId: "c1", situacaoAnterior: "a_confirmar", dataRespostaDefinida: false, classeIa: "nao_e_resposta" } });
    await desfazerAplicacaoIa("m1");
    expect(mocks.tx.consultaCotacao.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", situacao: "sem_resposta" },
      data: { situacao: "a_confirmar", gmailRespostaId: "m1", regra: "sinais_ambiguos" },
    });
  });

  it("sem consulta registrada, só reabre a fila", async () => {
    armarDesfazer({ linha: { consultaId: null, situacaoAnterior: null, dataRespostaDefinida: false, classeIa: "recusa" } });
    expect(await desfazerAplicacaoIa("m1")).toBe("desfeita");
    expect(mocks.tx.consultaCotacao.updateMany).not.toHaveBeenCalled();
  });
});
