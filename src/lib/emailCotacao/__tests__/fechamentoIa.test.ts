import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    respostaEmailPendente: { updateMany: vi.fn() },
    classificacaoIaResposta: { updateMany: vi.fn() },
  };
  return {
    tx,
    db: {
      respostaEmailPendente: { findMany: vi.fn(), updateMany: vi.fn() },
      classificacaoIaResposta: { findMany: vi.fn() },
      consultaCotacao: { findMany: vi.fn() },
      auditLog: { createMany: vi.fn() },
      $transaction: vi.fn<(fn: (t: typeof tx) => unknown, o?: unknown) => Promise<unknown>>(async (fn) => fn(tx)),
    },
    aplicar: vi.fn(),
    ligada: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("../aplicarIa", () => ({ aplicarClassificacaoIa: mocks.aplicar, aplicacaoIaLigada: mocks.ligada }));

import { executarFechamento, planejarFechamento } from "../fechamentoIa";

const D_2026 = new Date("2026-11-10T12:00:00Z");
const D_OUT25 = new Date("2025-11-05T12:00:00-03:00");

interface P { id: string; m: string; d?: Date; ia?: { c: string; k: string | null }; sit?: string }
function cenario(ps: P[]) {
  mocks.db.respostaEmailPendente.findMany.mockResolvedValue(ps.map((p) => ({ id: p.id, gmailMensagemId: p.m, dataResposta: p.d ?? D_2026 })));
  mocks.db.classificacaoIaResposta.findMany.mockResolvedValue(
    ps.filter((p) => p.ia).map((p) => ({ gmailMensagemId: p.m, classeIa: p.ia!.c, consultaId: p.ia!.k })),
  );
  mocks.db.consultaCotacao.findMany.mockResolvedValue(
    ps.filter((p) => p.ia?.k).map((p) => ({ id: p.ia!.k as string, situacao: p.sit ?? "a_confirmar" })),
  );
}

describe("planejarFechamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.respostaEmailPendente.findMany.mockResolvedValue([]);
    mocks.db.consultaCotacao.findMany.mockResolvedValue([]);
  });

  it("lê só as pendentes ABERTAS e as leituras da IA não desfeitas/não aplicadas (select explícito, §9.46)", async () => {
    cenario([{ id: "p1", m: "m1", ia: { c: "recusa", k: "c1" } }]);
    await planejarFechamento();
    expect(mocks.db.respostaEmailPendente.findMany).toHaveBeenCalledWith({
      where: { resolvidaEm: null },
      select: { id: true, gmailMensagemId: true, dataResposta: true },
    });
    expect(mocks.db.classificacaoIaResposta.findMany).toHaveBeenCalledWith({
      where: { gmailMensagemId: { in: ["m1"] }, desfeitaEm: null, aplicadaEm: null },
      select: { gmailMensagemId: true, classeIa: true, consultaId: true },
    });
    expect(mocks.db.consultaCotacao.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["c1"] } },
      select: { id: true, situacao: true },
    });
  });

  it("separa os quatro grupos", async () => {
    cenario([
      { id: "p1", m: "m1", ia: { c: "nao_e_resposta", k: "c1" }, sit: "a_confirmar" },
      { id: "p2", m: "m2", ia: { c: "orcamento", k: "c2" }, sit: "sem_resposta" },
      { id: "p3", m: "m3", ia: { c: "recusa", k: "c3" }, sit: "recusa" },
      { id: "p4", m: "m4", ia: { c: "orcamento", k: "c4" }, sit: "duvida" },
      { id: "p5", m: "m5", ia: { c: "duvida", k: null } },
      { id: "p6", m: "m6", d: D_OUT25 },
    ]);
    const p = await planejarFechamento();
    expect(p.aplicar.map((x) => x.gmailMensagemId)).toEqual(["m1", "m2"]);
    expect(p.fecharSemAlterar.map((x) => x.gmailMensagemId)).toEqual(["m3", "m4"]);
    expect(p.semFornecedor.map((x) => x.gmailMensagemId)).toEqual(["m5"]);
    expect(p.dispensar.map((x) => x.gmailMensagemId)).toEqual(["m6"]);
  });

  it("sem leitura da IA e FORA de out–dez/2025: fica na fila (não é dispensada)", async () => {
    cenario([{ id: "p1", m: "m1", d: new Date("2026-03-10T12:00:00Z") }, { id: "p2", m: "m2", d: new Date("2025-09-01T12:00:00Z") }]);
    const p = await planejarFechamento();
    expect(p).toEqual({ aplicar: [], semFornecedor: [], fecharSemAlterar: [], dispensar: [] });
  });

  it("'não é resposta' sem fornecedor não é tocada", async () => {
    cenario([{ id: "p1", m: "m1", ia: { c: "nao_e_resposta", k: null } }]);
    expect((await planejarFechamento()).semFornecedor).toEqual([]);
  });

  it("sem pendente aberta não consulta mais nada", async () => {
    expect((await planejarFechamento()).aplicar).toEqual([]);
    expect(mocks.db.classificacaoIaResposta.findMany).not.toHaveBeenCalled();
  });
});

describe("executarFechamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ligada.mockReturnValue(true);
    mocks.aplicar.mockResolvedValue("aplicada");
    mocks.db.respostaEmailPendente.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.respostaEmailPendente.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.classificacaoIaResposta.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.auditLog.createMany.mockResolvedValue({ count: 0 });
  });

  const TUDO: P[] = [
    { id: "p1", m: "m1", ia: { c: "nao_e_resposta", k: "c1" }, sit: "a_confirmar" },
    { id: "p2", m: "m2", ia: { c: "recusa", k: "c2" }, sit: "orcamento" },
    { id: "p3", m: "m3", ia: { c: "duvida", k: null } },
    { id: "p4", m: "m4", d: D_OUT25 },
  ];

  it("aplica pela MESMA função do critério, fecha as já decididas SEM tocar na consulta e dispensa as antigas", async () => {
    cenario(TUDO);
    const r = await executarFechamento("u1");
    expect(mocks.aplicar).toHaveBeenCalledTimes(1);
    expect(mocks.aplicar).toHaveBeenCalledWith({ gmailMensagemId: "m1", classe: "nao_e_resposta", consultaId: "c1", dataResposta: D_2026 });
    expect(r).toEqual({ iaDesligada: false, aplicadas: 1, ignoradas: 0, semFornecedor: 1, fechadasSemAlterar: 1, dispensadas: 1 });
    // fecha a entrada (p2 e p4) só pelo id da fila, com resolvidaEm: null no WHERE (atômico)
    expect(mocks.db.respostaEmailPendente.updateMany).toHaveBeenCalledWith({ where: { id: "p2", resolvidaEm: null }, data: { resolvidaEm: expect.any(Date) } });
    expect(mocks.db.respostaEmailPendente.updateMany).toHaveBeenCalledWith({ where: { id: "p4", resolvidaEm: null }, data: { resolvidaEm: expect.any(Date) } });
  });

  it("a consulta já decidida NUNCA recebe escrita de situação (nenhuma aplicação para ela)", async () => {
    cenario([{ id: "p2", m: "m2", ia: { c: "recusa", k: "c2" }, sit: "orcamento" }]);
    await executarFechamento("u1");
    expect(mocks.aplicar).not.toHaveBeenCalled();
  });

  it("audita cada grupo com a ação e a origem certas, só do que de fato mudou", async () => {
    cenario(TUDO);
    await executarFechamento("u1");
    const chamadas = mocks.db.auditLog.createMany.mock.calls.map((c) => c[0].data).flat();
    expect(chamadas).toEqual(
      expect.arrayContaining([
        { userId: "u1", acao: "ia_aplicar_resposta_email", detalhes: { gmailMensagemId: "m1", consultaId: "c1", classe: "nao_e_resposta", origem: "fechamento" } },
        { userId: "u1", acao: "ia_aplicar_resposta_email", detalhes: { gmailMensagemId: "m3", classe: "duvida", origem: "fechamento_sem_fornecedor" } },
        { userId: "u1", acao: "fechar_pendencia_sem_alterar", detalhes: { gmailMensagemId: "m2" } },
        { userId: "u1", acao: "fechar_pendencia_dispensada", detalhes: { gmailMensagemId: "m4", motivo: "sem_leitura_da_ia_out_dez_2025" } },
      ]),
    );
    expect(chamadas).toHaveLength(4);
  });

  it("entrada que outro já fechou não é contada nem auditada", async () => {
    cenario([{ id: "p2", m: "m2", ia: { c: "recusa", k: "c2" }, sit: "orcamento" }]);
    mocks.db.respostaEmailPendente.updateMany.mockResolvedValue({ count: 0 });
    const r = await executarFechamento("u1");
    expect(r.fechadasSemAlterar).toBe(0);
    expect(mocks.db.auditLog.createMany).not.toHaveBeenCalled();
  });

  it("aplicação que não vingou (decisão chegou antes) conta como ignorada e não é auditada", async () => {
    cenario([{ id: "p1", m: "m1", ia: { c: "orcamento", k: "c1" }, sit: "a_confirmar" }]);
    mocks.aplicar.mockResolvedValue("ja_resolvida");
    const r = await executarFechamento("u1");
    expect(r).toMatchObject({ aplicadas: 0, ignoradas: 1 });
    expect(mocks.db.auditLog.createMany).not.toHaveBeenCalled();
  });

  it("chave da IA desligada: pula as partes que aplicam IA (aplicar e sem fornecedor), mas ainda encerra as já decididas e dispensa", async () => {
    mocks.ligada.mockReturnValue(false);
    cenario(TUDO);
    const r = await executarFechamento("u1");
    expect(r).toEqual({ iaDesligada: true, aplicadas: 0, ignoradas: 0, semFornecedor: 0, fechadasSemAlterar: 1, dispensadas: 1 });
    expect(mocks.aplicar).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("sem fornecedor: se a linha da IA mudou no meio, a fila é REABERTA (não fica fechada sem classificação)", async () => {
    cenario([{ id: "p3", m: "m3", ia: { c: "duvida", k: null } }]);
    mocks.tx.classificacaoIaResposta.updateMany.mockResolvedValue({ count: 0 });
    const r = await executarFechamento("u1");
    expect(r.semFornecedor).toBe(0);
    expect(mocks.tx.respostaEmailPendente.updateMany).toHaveBeenLastCalledWith({ where: { id: "p3" }, data: { resolvidaEm: null } });
  });
});
