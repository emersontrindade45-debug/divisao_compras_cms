import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    respostaEmailPendente: { findMany: vi.fn() },
    classificacaoIaResposta: { findMany: vi.fn() },
    consultaCotacao: { findMany: vi.fn() },
    auditLog: { createMany: vi.fn() },
  },
  aplicar: vi.fn(),
  ligada: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("../aplicarIa", () => ({
  aplicarClassificacaoIa: mocks.aplicar,
  aplicacaoIaLigada: mocks.ligada,
  MAX_APLICACOES_POR_CLIQUE: 100,
}));

import { aplicarPoliticaIa, listarAdotaveisPelaPolitica } from "../politicaIa";

const DATA = new Date("2026-11-20T12:00:00Z");

function cenario(linhas: { id: string; classe: string; consulta: string; situacao: string }[]) {
  mocks.db.respostaEmailPendente.findMany.mockResolvedValue(linhas.map((l) => ({ gmailMensagemId: l.id, dataResposta: DATA })));
  mocks.db.classificacaoIaResposta.findMany.mockResolvedValue(
    linhas.map((l) => ({ gmailMensagemId: l.id, classeIa: l.classe, consultaId: l.consulta })),
  );
  mocks.db.consultaCotacao.findMany.mockResolvedValue(linhas.map((l) => ({ id: l.consulta, situacao: l.situacao })));
}

describe("listarAdotaveisPelaPolitica", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.respostaEmailPendente.findMany.mockResolvedValue([]);
  });

  it("pergunta só pelas pendentes ABERTAS, IA não aplicada/desfeita, com consulta e só recusa/dúvida (select explícito)", async () => {
    cenario([{ id: "m1", classe: "recusa", consulta: "c1", situacao: "a_confirmar" }]);
    await listarAdotaveisPelaPolitica();
    expect(mocks.db.respostaEmailPendente.findMany).toHaveBeenCalledWith({
      where: { resolvidaEm: null },
      select: { gmailMensagemId: true, dataResposta: true },
    });
    expect(mocks.db.classificacaoIaResposta.findMany).toHaveBeenCalledWith({
      where: {
        gmailMensagemId: { in: ["m1"] },
        aplicadaEm: null,
        desfeitaEm: null,
        consultaId: { not: null },
        classeIa: { in: ["recusa", "duvida"] },
      },
      orderBy: { createdAt: "asc" },
      select: { gmailMensagemId: true, classeIa: true, consultaId: true },
    });
    expect(mocks.db.consultaCotacao.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["c1"] } },
      select: { id: true, situacao: true },
    });
  });

  it("sem pendente aberta não consulta mais nada", async () => {
    expect(await listarAdotaveisPelaPolitica()).toEqual([]);
    expect(mocks.db.classificacaoIaResposta.findMany).not.toHaveBeenCalled();
  });

  it("deixa de fora a consulta que JÁ tem decisão e mantém a aberta", async () => {
    cenario([
      { id: "m1", classe: "recusa", consulta: "c1", situacao: "a_confirmar" },
      { id: "m2", classe: "recusa", consulta: "c2", situacao: "orcamento" },
      { id: "m3", classe: "duvida", consulta: "c3", situacao: "recusa" },
      { id: "m4", classe: "duvida", consulta: "c4", situacao: "sem_resposta" },
    ]);
    const r = await listarAdotaveisPelaPolitica();
    expect(r.map((x) => x.gmailMensagemId)).toEqual(["m1", "m4"]);
    expect(r[0]).toEqual({ gmailMensagemId: "m1", classeIa: "recusa", consultaId: "c1", dataResposta: DATA });
  });

  it("não adota classe fora da política mesmo que o banco a devolva", async () => {
    cenario([
      { id: "m1", classe: "orcamento", consulta: "c1", situacao: "a_confirmar" },
      { id: "m2", classe: "nao_e_resposta", consulta: "c2", situacao: "a_confirmar" },
    ]);
    expect(await listarAdotaveisPelaPolitica()).toEqual([]);
  });
});

describe("aplicarPoliticaIa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ligada.mockReturnValue(true);
    mocks.aplicar.mockResolvedValue("aplicada");
    mocks.db.auditLog.createMany.mockResolvedValue({ count: 0 });
  });

  it("chave desligada: não lê, não aplica e não audita (§9.45)", async () => {
    mocks.ligada.mockReturnValue(false);
    const r = await aplicarPoliticaIa("u1");
    expect(r.desligada).toBe(true);
    expect(mocks.db.respostaEmailPendente.findMany).not.toHaveBeenCalled();
    expect(mocks.aplicar).not.toHaveBeenCalled();
    expect(mocks.db.auditLog.createMany).not.toHaveBeenCalled();
  });

  it("aplica pela MESMA função do critério automático, com a classe e a data da resposta", async () => {
    cenario([
      { id: "m1", classe: "recusa", consulta: "c1", situacao: "a_confirmar" },
      { id: "m2", classe: "duvida", consulta: "c2", situacao: "a_confirmar" },
    ]);
    const r = await aplicarPoliticaIa("u1");
    expect(mocks.aplicar).toHaveBeenCalledWith({ gmailMensagemId: "m1", classe: "recusa", consultaId: "c1", dataResposta: DATA });
    expect(mocks.aplicar).toHaveBeenCalledWith({ gmailMensagemId: "m2", classe: "duvida", consultaId: "c2", dataResposta: DATA });
    expect(r).toMatchObject({ aplicadas: 2, ignoradas: 0, restantes: 0, porClasse: { recusa: 1, duvida: 1 } });
  });

  it("audita cada aplicação com origem 'politica' e só as que de fato aplicaram", async () => {
    cenario([
      { id: "m1", classe: "recusa", consulta: "c1", situacao: "a_confirmar" },
      { id: "m2", classe: "recusa", consulta: "c2", situacao: "a_confirmar" },
    ]);
    mocks.aplicar.mockResolvedValueOnce("aplicada").mockResolvedValueOnce("ja_resolvida");
    const r = await aplicarPoliticaIa("u1");
    expect(r).toMatchObject({ aplicadas: 1, ignoradas: 1 });
    expect(mocks.db.auditLog.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "u1",
          acao: "ia_aplicar_resposta_email",
          detalhes: { gmailMensagemId: "m1", consultaId: "c1", classe: "recusa", origem: "politica" },
        },
      ],
    });
  });

  it("nada aplicado: não escreve auditoria vazia", async () => {
    cenario([{ id: "m1", classe: "recusa", consulta: "c1", situacao: "a_confirmar" }]);
    mocks.aplicar.mockResolvedValue("ja_tratada");
    await aplicarPoliticaIa("u1");
    expect(mocks.db.auditLog.createMany).not.toHaveBeenCalled();
  });

  it("respeita o limite por clique e informa quantas restam (precisa de MAIS que o limite)", async () => {
    const muitas = Array.from({ length: 106 }, (_, i) => ({ id: `m${i}`, classe: "recusa", consulta: `c${i}`, situacao: "a_confirmar" }));
    cenario(muitas);
    const r = await aplicarPoliticaIa("u1");
    expect(mocks.aplicar).toHaveBeenCalledTimes(100);
    expect(r).toMatchObject({ aplicadas: 100, restantes: 6 });
  });
});
