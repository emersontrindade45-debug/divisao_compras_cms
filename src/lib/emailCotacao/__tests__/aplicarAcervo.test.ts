import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    classificacaoIaResposta: { updateMany: vi.fn(), findUnique: vi.fn() },
    respostaEmailPendente: { updateMany: vi.fn() },
    consultaCotacao: { findUnique: vi.fn(), updateMany: vi.fn() },
  };
  return {
    tx,
    db: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      respostaEmailPendente: { findMany: vi.fn() },
      classificacaoIaResposta: { findMany: vi.fn() },
      auditLog: { createMany: vi.fn() },
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { aplicarAprovadasPendentes, listarAprovadasAplicaveis } from "../aplicarIa";

const original = process.env.IA_APLICAR_AUTOMATICO;
const D = new Date("2026-10-21T19:00:00Z");

function armar(n: number, abertas = n) {
  mocks.db.respostaEmailPendente.findMany.mockResolvedValue(
    Array.from({ length: abertas }, (_, i) => ({ gmailMensagemId: `m${i}`, dataResposta: D })),
  );
  mocks.db.classificacaoIaResposta.findMany.mockResolvedValue(
    Array.from({ length: Math.min(n, abertas) }, (_, i) => ({ gmailMensagemId: `m${i}`, classeIa: "recusa", consultaId: `c${i}` })),
  );
  const t = mocks.tx;
  t.classificacaoIaResposta.updateMany.mockResolvedValue({ count: 1 });
  t.respostaEmailPendente.updateMany.mockResolvedValue({ count: 1 });
  t.consultaCotacao.findUnique.mockResolvedValue({ situacao: "a_confirmar", gmailRespostaId: "x" });
  t.consultaCotacao.updateMany.mockResolvedValue({ count: 1 });
}

describe("aplicar acervo aprovado em sombra", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.IA_APLICAR_AUTOMATICO = "1";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.IA_APLICAR_AUTOMATICO;
    else process.env.IA_APLICAR_AUTOMATICO = original;
  });

  it("chave desligada: não lê nem escreve nada", async () => {
    delete process.env.IA_APLICAR_AUTOMATICO;
    const r = await aplicarAprovadasPendentes("u1");
    expect(r).toEqual({ aplicadas: 0, ignoradas: 0, restantes: 0 });
    expect(mocks.db.classificacaoIaResposta.findMany).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("só considera critério aprovado, não aplicado, não desfeito, com consulta, e fila aberta", async () => {
    armar(1);
    await listarAprovadasAplicaveis();
    expect(mocks.db.respostaEmailPendente.findMany.mock.calls[0][0].where).toEqual({ resolvidaEm: null });
    expect(mocks.db.classificacaoIaResposta.findMany.mock.calls[0][0].where).toEqual({
      gmailMensagemId: { in: ["m0"] },
      criterioOk: true,
      aplicadaEm: null,
      desfeitaEm: null,
      consultaId: { not: null },
    });
  });

  it("sem fila aberta (analista já resolveu), nada a aplicar", async () => {
    mocks.db.respostaEmailPendente.findMany.mockResolvedValue([]);
    expect(await listarAprovadasAplicaveis()).toEqual([]);
    expect(mocks.db.classificacaoIaResposta.findMany).not.toHaveBeenCalled();
  });

  it("aplica pela mesma função atômica e audita só ids, marcando a origem", async () => {
    armar(3);
    const r = await aplicarAprovadasPendentes("u1");
    expect(r).toEqual({ aplicadas: 3, ignoradas: 0, restantes: 0 });
    const dados = mocks.db.auditLog.createMany.mock.calls[0][0].data;
    expect(dados).toHaveLength(3);
    expect(dados[0]).toEqual({
      userId: "u1",
      acao: "ia_aplicar_resposta_email",
      detalhes: { gmailMensagemId: "m0", consultaId: "c0", classe: "recusa", origem: "acervo" },
    });
  });

  it("limita a 100 por clique e informa quantas restam", async () => {
    armar(130);
    const r = await aplicarAprovadasPendentes("u1");
    expect(r.aplicadas).toBe(100);
    expect(r.restantes).toBe(30);
  });

  it("decisão do analista que chegou antes (fila fechada na transação) conta como ignorada e não audita", async () => {
    armar(2);
    mocks.tx.respostaEmailPendente.updateMany.mockResolvedValue({ count: 0 });
    const r = await aplicarAprovadasPendentes("u1");
    expect(r.aplicadas).toBe(0);
    expect(r.ignoradas).toBe(2);
    expect(mocks.db.auditLog.createMany).not.toHaveBeenCalled();
  });
});
