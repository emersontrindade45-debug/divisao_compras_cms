import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    classificacaoIaResposta: { updateMany: vi.fn(), findUnique: vi.fn() },
    consultaCotacao: { findUnique: vi.fn(), updateMany: vi.fn() },
  };
  return {
    tx,
    db: {
      respostaEmailPendente: { findUnique: vi.fn(), findMany: vi.fn() },
      classificacaoIaResposta: { findMany: vi.fn() },
      consultaCotacao: { findMany: vi.fn() },
      $transaction: vi.fn<(fn: (t: typeof tx) => unknown, opcoes?: unknown) => Promise<unknown>>(async (fn) => fn(tx)),
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));

import {
  buscarCandidatosDoEnvio,
  ligarRespostaAConsulta,
  listarRespostasLigaveis,
  MAX_CANDIDATOS,
  OPCOES_TRANSACAO_LIGACAO,
} from "../ligarRespostaFornecedor";

const DATA = new Date("2026-10-21T19:54:00Z");

describe("listarRespostasLigaveis", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pergunta só pelas aplicadas, não desfeitas e SEM consulta, das três classes (select explícito)", async () => {
    mocks.db.classificacaoIaResposta.findMany.mockResolvedValue([]);
    await listarRespostasLigaveis();
    expect(mocks.db.classificacaoIaResposta.findMany).toHaveBeenCalledWith({
      where: {
        consultaId: null,
        aplicadaEm: { not: null },
        desfeitaEm: null,
        classeIa: { in: ["orcamento", "recusa", "duvida"] },
      },
      orderBy: { createdAt: "asc" },
      select: { gmailMensagemId: true, classeIa: true, justificativa: true },
    });
  });

  it("monta o item com link do Gmail, número do processo e domínio genérico sinalizado", async () => {
    mocks.db.classificacaoIaResposta.findMany.mockResolvedValue([
      { gmailMensagemId: "m1", classeIa: "recusa", justificativa: "não atende" },
      { gmailMensagemId: "m2", classeIa: "duvida", justificativa: "pergunta" },
      { gmailMensagemId: "sem-fila", classeIa: "orcamento", justificativa: "x" },
    ]);
    mocks.db.respostaEmailPendente.findMany.mockResolvedValue([
      { gmailMensagemId: "m1", dataResposta: DATA, remetenteDominio: "gmail.com", envio: { numeroProcessoAssunto: "12141", processo: null } },
      { gmailMensagemId: "m2", dataResposta: DATA, remetenteDominio: "acme.com.br", envio: { numeroProcessoAssunto: null, processo: { numero: "0382/2026" } } },
    ]);
    const itens = await listarRespostasLigaveis();
    expect(itens.map((i) => i.gmailMensagemId)).toEqual(["m1", "m2"]); // sem a fila não há envio a que ligar
    expect(itens[0]).toMatchObject({ dominioGenerico: true, processoNumero: "12141", classe: "recusa" });
    expect(itens[1]).toMatchObject({ dominioGenerico: false, processoNumero: "0382/2026" });
    expect(itens[0].linkGmail).toContain("#all/m1");
  });

  it("nada classificado sem fornecedor: nem consulta a fila", async () => {
    mocks.db.classificacaoIaResposta.findMany.mockResolvedValue([]);
    expect(await listarRespostasLigaveis()).toEqual([]);
    expect(mocks.db.respostaEmailPendente.findMany).not.toHaveBeenCalled();
  });
});

describe("buscarCandidatosDoEnvio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.respostaEmailPendente.findUnique.mockResolvedValue({ envioId: "env1", remetenteDominio: "acme.com.br" });
    mocks.db.consultaCotacao.findMany.mockResolvedValue([
      { id: "c1", email: "vendas@acme.com.br", razaoSocial: "Acme", situacao: "sem_resposta" },
    ]);
  });

  it("resposta inexistente: devolve null e não busca nada", async () => {
    mocks.db.respostaEmailPendente.findUnique.mockResolvedValue(null);
    expect(await buscarCandidatosDoEnvio("nao-existe", "")).toBeNull();
    expect(mocks.db.consultaCotacao.findMany).not.toHaveBeenCalled();
  });

  it("sem termo e domínio corporativo: procura pelo domínio, SEMPRE restrito ao envio da resposta", async () => {
    const r = await buscarCandidatosDoEnvio("m1", "");
    expect(mocks.db.consultaCotacao.findMany).toHaveBeenCalledWith({
      where: { envioId: "env1", email: { endsWith: "@acme.com.br" } },
      orderBy: { email: "asc" },
      take: 12,
      select: { id: true, email: true, razaoSocial: true, situacao: true },
    });
    expect(r).toEqual([{ consultaId: "c1", email: "vendas@acme.com.br", razaoSocial: "Acme", situacao: "sem_resposta" }]);
  });

  it("sem termo e domínio genérico: não há critério (gmail.com não identifica empresa)", async () => {
    mocks.db.respostaEmailPendente.findUnique.mockResolvedValue({ envioId: "env1", remetenteDominio: "gmail.com" });
    expect(await buscarCandidatosDoEnvio("m1", "")).toEqual([]);
    expect(mocks.db.consultaCotacao.findMany).not.toHaveBeenCalled();
  });

  it("termo curto demais não busca", async () => {
    expect(await buscarCandidatosDoEnvio("m1", "ac")).toEqual([]);
    expect(mocks.db.consultaCotacao.findMany).not.toHaveBeenCalled();
  });

  it("com termo: procura no e-mail e na razão social, ainda dentro do envio", async () => {
    await buscarCandidatosDoEnvio("m1", "  Acme ");
    const arg = mocks.db.consultaCotacao.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      envioId: "env1",
      OR: [{ email: { contains: "acme" } }, { razaoSocial: { contains: "Acme", mode: "insensitive" } }],
    });
    expect(arg.take).toBe(MAX_CANDIDATOS);
  });
});

function armar(o: {
  consulta?: { envioId: string; situacao: string } | null;
  ligada?: number;
  classe?: string | null;
  aplicada?: number;
  data?: number;
} = {}) {
  mocks.db.respostaEmailPendente.findUnique.mockResolvedValue({ envioId: "env1", dataResposta: DATA });
  const t = mocks.tx;
  t.consultaCotacao.findUnique.mockResolvedValue(o.consulta === undefined ? { envioId: "env1", situacao: "sem_resposta" } : o.consulta);
  t.classificacaoIaResposta.updateMany.mockResolvedValue({ count: 1 });
  t.classificacaoIaResposta.updateMany.mockResolvedValueOnce({ count: o.ligada ?? 1 });
  t.classificacaoIaResposta.findUnique.mockResolvedValue(o.classe === null ? null : { classeIa: o.classe ?? "orcamento" });
  t.consultaCotacao.updateMany.mockResolvedValueOnce({ count: o.aplicada ?? 1 });
  t.consultaCotacao.updateMany.mockResolvedValue({ count: o.data ?? 1 });
}

describe("ligarRespostaAConsulta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Zera também as filas de "Once": as não consumidas de um caso vazariam para o seguinte.
    for (const m of [
      mocks.tx.classificacaoIaResposta.updateMany,
      mocks.tx.classificacaoIaResposta.findUnique,
      mocks.tx.consultaCotacao.findUnique,
      mocks.tx.consultaCotacao.updateMany,
    ]) m.mockReset();
  });

  it("liga a linha da IA, aplica a classe LIDA DO BANCO na consulta aberta e prepara o Desfazer", async () => {
    armar({ classe: "recusa" });
    const r = await ligarRespostaAConsulta("m1", "c1");
    expect(r).toEqual({ tipo: "ligada", aplicada: true, situacao: "recusa" });
    expect(mocks.tx.classificacaoIaResposta.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        gmailMensagemId: "m1",
        aplicadaEm: { not: null },
        desfeitaEm: null,
        consultaId: null,
        classeIa: { in: ["orcamento", "recusa", "duvida"] },
      },
      data: { consultaId: "c1" },
    });
    expect(mocks.tx.consultaCotacao.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "c1", situacao: { in: ["sem_resposta", "a_confirmar", "duvida"] } },
      data: { situacao: "recusa", regra: "ia", gmailRespostaId: "m1" },
    });
    expect(mocks.tx.consultaCotacao.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "c1", dataResposta: null },
      data: { dataResposta: DATA },
    });
    expect(mocks.tx.classificacaoIaResposta.updateMany).toHaveBeenNthCalledWith(2, {
      where: { gmailMensagemId: "m1" },
      data: { situacaoAnterior: "sem_resposta", dataRespostaDefinida: true },
    });
    expect(mocks.db.$transaction.mock.calls[0][1]).toEqual(OPCOES_TRANSACAO_LIGACAO);
  });

  it("consulta de OUTRO envio: recusa e não grava nada", async () => {
    armar({ consulta: { envioId: "outro-envio", situacao: "sem_resposta" } });
    const r = await ligarRespostaAConsulta("m1", "c1");
    expect(r).toEqual({ tipo: "erro", mensagem: "Este fornecedor não pertence ao envio desta resposta." });
    expect(mocks.tx.classificacaoIaResposta.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.consultaCotacao.updateMany).not.toHaveBeenCalled();
  });

  it("consulta inexistente: recusa", async () => {
    armar({ consulta: null });
    expect((await ligarRespostaAConsulta("m1", "c1")).tipo).toBe("erro");
    expect(mocks.tx.classificacaoIaResposta.updateMany).not.toHaveBeenCalled();
  });

  it("resposta já ligada/desfeita (updateMany count 0): erro, e a consulta não é tocada", async () => {
    armar({ ligada: 0 });
    const r = await ligarRespostaAConsulta("m1", "c1");
    expect(r.tipo).toBe("erro");
    expect(mocks.tx.consultaCotacao.updateMany).not.toHaveBeenCalled();
  });

  it("fila inexistente: erro sem abrir transação", async () => {
    mocks.db.respostaEmailPendente.findUnique.mockResolvedValue(null);
    expect(await ligarRespostaAConsulta("m1", "c1")).toEqual({ tipo: "erro", mensagem: "Resposta não encontrada." });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("consulta que já tinha decisão: fica ligada, mas a situação é MANTIDA e nada do Desfazer é gravado", async () => {
    armar({ consulta: { envioId: "env1", situacao: "orcamento" }, aplicada: 0 });
    const r = await ligarRespostaAConsulta("m1", "c1");
    expect(r).toEqual({ tipo: "ligada", aplicada: false, situacao: "orcamento" });
    // só o 1º updateMany da consulta (a tentativa de aplicar); sem data de resposta
    expect(mocks.tx.consultaCotacao.updateMany).toHaveBeenCalledTimes(1);
    // só o 1º updateMany da IA (a ligação); sem situacaoAnterior
    expect(mocks.tx.classificacaoIaResposta.updateMany).toHaveBeenCalledTimes(1);
  });

  it("não sobrescreve data de resposta já existente: dataRespostaDefinida fica falso", async () => {
    armar({ data: 0 });
    await ligarRespostaAConsulta("m1", "c1");
    expect(mocks.tx.classificacaoIaResposta.updateMany).toHaveBeenNthCalledWith(2, {
      where: { gmailMensagemId: "m1" },
      data: { situacaoAnterior: "sem_resposta", dataRespostaDefinida: false },
    });
  });

  it("linha da IA sumiu no meio: erro (a transação desfaz a ligação)", async () => {
    armar({ classe: null });
    expect((await ligarRespostaAConsulta("m1", "c1")).tipo).toBe("erro");
    expect(mocks.tx.consultaCotacao.updateMany).not.toHaveBeenCalled();
  });
});
