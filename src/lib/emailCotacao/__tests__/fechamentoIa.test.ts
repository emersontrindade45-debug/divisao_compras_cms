import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    respostaEmailPendente: { updateMany: vi.fn() },
    classificacaoIaResposta: { updateMany: vi.fn() },
    consultaCotacao: { updateMany: vi.fn() },
  };
  return {
    tx,
    db: {
      respostaEmailPendente: { findMany: vi.fn(), updateMany: vi.fn() },
      classificacaoIaResposta: { findMany: vi.fn() },
      consultaCotacao: { findMany: vi.fn(), updateMany: vi.fn() },
      auditLog: { createMany: vi.fn() },
      $transaction: vi.fn<(fn: (t: typeof tx) => unknown, o?: unknown) => Promise<unknown>>(async (fn) => fn(tx)),
    },
    aplicar: vi.fn(),
    ligada: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("../aplicarIa", () => ({ aplicarClassificacaoIa: mocks.aplicar, aplicacaoIaLigada: mocks.ligada, REGRA_IA: "ia" }));

import { executarFechamento, planejarFechamento } from "../fechamentoIa";

const D_2026 = new Date("2026-11-10T12:00:00Z");
const D_OUT25 = new Date("2025-11-05T12:00:00-03:00");

interface P { id: string; m: string; d?: Date; ia?: { c: string; k: string | null }; sit?: string }
interface O { m: string; c: string; k: string; fila?: "aberta" | "resolvida" | "nenhuma"; semIa?: boolean; dataResp?: Date | null; regra?: string | null }

/** `ps` = entradas ABERTAS da fila; `os` = consultas "a confirmar" ligadas a uma mensagem (órfãs ou não). */
function cenario(ps: P[], os: O[] = []) {
  mocks.db.respostaEmailPendente.findMany.mockImplementation(async (a: { where: { resolvidaEm?: null; gmailMensagemId?: unknown } }) => {
    if (a.where.resolvidaEm === null) return ps.map((p) => ({ id: p.id, gmailMensagemId: p.m, dataResposta: p.d ?? D_2026 }));
    return os.filter((o) => o.fila !== "nenhuma").map((o) => ({ gmailMensagemId: o.m, dataResposta: D_2026 }));
  });
  mocks.db.classificacaoIaResposta.findMany.mockImplementation(async (a: { where: { gmailMensagemId: { in: string[] } } }) => {
    const ids = a.where.gmailMensagemId.in;
    const das = ps.filter((p) => p.ia && ids.includes(p.m)).map((p) => ({ gmailMensagemId: p.m, classeIa: p.ia!.c, consultaId: p.ia!.k }));
    const dasOrf = os.filter((o) => !o.semIa && ids.includes(o.m)).map((o) => ({ gmailMensagemId: o.m, classeIa: o.c, consultaId: o.k }));
    return [...das, ...dasOrf];
  });
  mocks.db.consultaCotacao.findMany.mockImplementation(async (a: { where: { situacao?: string; id?: { in: string[] } } }) => {
    if (a.where.situacao === "a_confirmar") return os.map((o) => ({ id: o.k, gmailRespostaId: o.m, situacao: "a_confirmar", regra: o.regra ?? null, dataResposta: o.dataResp ?? null }));
    return ps.filter((p) => p.ia?.k).map((p) => ({ id: p.ia!.k as string, situacao: p.sit ?? "a_confirmar" }));
  });
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
    expect(mocks.db.consultaCotacao.findMany).toHaveBeenCalledWith({
      where: { situacao: "a_confirmar", gmailRespostaId: { not: null } },
      select: { id: true, gmailRespostaId: true, situacao: true, regra: true, dataResposta: true },
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
    expect(p).toEqual({ aplicar: [], semFornecedor: [], fecharSemAlterar: [], dispensar: [], consultasOrfas: [], consultasDispensadas: [] });
  });

  it("'não é resposta' sem fornecedor não é tocada", async () => {
    cenario([{ id: "p1", m: "m1", ia: { c: "nao_e_resposta", k: null } }]);
    expect((await planejarFechamento()).semFornecedor).toEqual([]);
  });

  it("sem pendente aberta não procura leitura para as pendentes (só as órfãs, se houver)", async () => {
    cenario([]);
    expect((await planejarFechamento()).aplicar).toEqual([]);
    expect(mocks.db.classificacaoIaResposta.findMany).not.toHaveBeenCalled();
  });

  it("consultas ÓRFÃS: a confirmar + leitura da IA + fila já encerrada entram, com a data da resposta", async () => {
    cenario([], [{ m: "mo1", c: "nao_e_resposta", k: "co1" }, { m: "mo2", c: "duvida", k: "co2" }]);
    const p = await planejarFechamento();
    expect(p.consultasOrfas).toEqual([
      { gmailMensagemId: "mo1", classeIa: "nao_e_resposta", consultaId: "co1", dataResposta: D_2026 },
      { gmailMensagemId: "mo2", classeIa: "duvida", consultaId: "co2", dataResposta: D_2026 },
    ]);
  });

  it("órfã: sem leitura da IA não entra; com a fila ABERTA não entra (é tratada pelo outro grupo)", async () => {
    cenario(
      [{ id: "p9", m: "mo2", ia: { c: "recusa", k: "co2" }, sit: "a_confirmar" }],
      [{ m: "mo1", c: "recusa", k: "co1", semIa: true }, { m: "mo2", c: "recusa", k: "co2" }],
    );
    const p = await planejarFechamento();
    expect(p.consultasOrfas).toEqual([]);
    expect(p.aplicar.map((x) => x.gmailMensagemId)).toEqual(["mo2"]);
  });

  it("órfã: lê só leituras NÃO desfeitas, com select explícito (§9.46)", async () => {
    cenario([], [{ m: "mo1", c: "recusa", k: "co1" }]);
    await planejarFechamento();
    expect(mocks.db.classificacaoIaResposta.findMany).toHaveBeenCalledWith({
      where: { gmailMensagemId: { in: ["mo1"] }, desfeitaEm: null },
      select: { gmailMensagemId: true, classeIa: true },
    });
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
    mocks.tx.consultaCotacao.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.consultaCotacao.updateMany.mockResolvedValue({ count: 1 });
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
    expect(r).toEqual({ iaDesligada: false, aplicadas: 1, ignoradas: 0, semFornecedor: 1, fechadasSemAlterar: 1, dispensadas: 1, consultasResolvidas: 0, consultasDispensadas: 0 });
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
    expect(r).toEqual({ iaDesligada: true, aplicadas: 0, ignoradas: 0, semFornecedor: 0, fechadasSemAlterar: 1, dispensadas: 1, consultasResolvidas: 0, consultasDispensadas: 0 });
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

  describe("consultas órfãs", () => {
    const ORF: O[] = [
      { m: "mo1", c: "nao_e_resposta", k: "co1" },
      { m: "mo2", c: "recusa", k: "co2" },
    ];

    it("'não é resposta' devolve a consulta a sem_resposta, só se ainda for a_confirmar e desta mensagem (guarda atômica)", async () => {
      cenario([], [ORF[0]]);
      const r = await executarFechamento("u1");
      expect(r.consultasResolvidas).toBe(1);
      expect(mocks.tx.consultaCotacao.updateMany).toHaveBeenCalledWith({
        where: { id: "co1", situacao: "a_confirmar", gmailRespostaId: "mo1" },
        data: { situacao: "sem_resposta", dataResposta: null, gmailRespostaId: null, regra: null },
      });
    });

    it("recusa/dúvida/orçamento definem a consulta com regra 'ia' e a data da resposta (se faltava)", async () => {
      cenario([], [ORF[1]]);
      await executarFechamento("u1");
      expect(mocks.tx.consultaCotacao.updateMany).toHaveBeenCalledWith({
        where: { id: "co2", situacao: "a_confirmar", gmailRespostaId: "mo2" },
        data: { situacao: "recusa", regra: "ia", gmailRespostaId: "mo2" },
      });
      expect(mocks.tx.consultaCotacao.updateMany).toHaveBeenCalledWith({
        where: { id: "co2", dataResposta: null },
        data: { dataResposta: D_2026 },
      });
    });

    it("deixa a linha da IA no formato do Desfazer: aplicadaEm e situacaoAnterior = a_confirmar", async () => {
      cenario([], [ORF[1]]);
      await executarFechamento("u1");
      expect(mocks.tx.classificacaoIaResposta.updateMany).toHaveBeenCalledWith({
        where: { gmailMensagemId: "mo2", aplicadaEm: null, desfeitaEm: null },
        data: { aplicadaEm: expect.any(Date) },
      });
      expect(mocks.tx.classificacaoIaResposta.updateMany).toHaveBeenCalledWith({
        where: { gmailMensagemId: "mo2", desfeitaEm: null },
        data: { situacaoAnterior: "a_confirmar", dataRespostaDefinida: true },
      });
    });

    it("consulta que mudou no meio (0 linhas): não conta, não audita e não marca a IA", async () => {
      cenario([], [ORF[1]]);
      mocks.tx.consultaCotacao.updateMany.mockResolvedValue({ count: 0 });
      const r = await executarFechamento("u1");
      expect(r.consultasResolvidas).toBe(0);
      expect(mocks.tx.classificacaoIaResposta.updateMany).not.toHaveBeenCalled();
      expect(mocks.db.auditLog.createMany).not.toHaveBeenCalled();
    });

    it("audita com a origem 'fechamento_consulta'", async () => {
      cenario([], [ORF[0]]);
      await executarFechamento("u1");
      expect(mocks.db.auditLog.createMany).toHaveBeenCalledWith({
        data: [
          { userId: "u1", acao: "ia_aplicar_resposta_email", detalhes: { gmailMensagemId: "mo1", consultaId: "co1", classe: "nao_e_resposta", origem: "fechamento_consulta" } },
        ],
      });
    });

    it("erro numa consulta não derruba as outras", async () => {
      cenario([], ORF);
      mocks.tx.consultaCotacao.updateMany.mockRejectedValueOnce(new Error("falha")).mockResolvedValue({ count: 1 });
      const r = await executarFechamento("u1");
      expect(r.consultasResolvidas).toBe(1);
    });

    it("chave da IA desligada: não resolve nenhuma consulta", async () => {
      mocks.ligada.mockReturnValue(false);
      cenario([], ORF);
      const r = await executarFechamento("u1");
      expect(r.consultasResolvidas).toBe(0);
      expect(mocks.tx.consultaCotacao.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe("consultas 'a confirmar' de out a dez/2025 sem leitura da IA", () => {
  const D_2025 = new Date("2025-11-12T12:00:00-03:00");
  const D_ANTES = new Date("2025-09-30T12:00:00-03:00");
  const D_DEPOIS = new Date("2026-01-01T12:00:00-03:00");
  const ANTIGA: O = { m: "ma1", c: "recusa", k: "ca1", semIa: true, dataResp: D_2025, regra: "sinais_ambiguos" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ligada.mockReturnValue(true);
    mocks.db.respostaEmailPendente.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.consultaCotacao.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.auditLog.createMany.mockResolvedValue({ count: 0 });
  });

  it("entra no plano só com data DENTRO da janela, sem leitura da IA e com a fila já encerrada", async () => {
    cenario([], [
      ANTIGA,
      { ...ANTIGA, m: "ma2", k: "ca2", dataResp: D_ANTES },
      { ...ANTIGA, m: "ma3", k: "ca3", dataResp: D_DEPOIS },
      { ...ANTIGA, m: "ma4", k: "ca4", dataResp: null },
      { ...ANTIGA, m: "ma5", k: "ca5", semIa: false, c: "nao_e_resposta" },
    ]);
    const p = await planejarFechamento();
    expect(p.consultasDispensadas).toEqual([{ consultaId: "ca1", gmailMensagemId: "ma1", regraAnterior: "sinais_ambiguos", dataRespostaAnterior: D_2025 }]);
    // a que a IA leu segue pelo caminho das órfãs, não por este
    expect(p.consultasOrfas.map((o) => o.consultaId)).toEqual(["ca5"]);
  });

  it("devolve a 'sem resposta' com guarda atômica (situação e mensagem no WHERE) e limpa a ligação", async () => {
    cenario([], [ANTIGA]);
    const r = await executarFechamento("u1");
    expect(r.consultasDispensadas).toBe(1);
    expect(mocks.db.consultaCotacao.updateMany).toHaveBeenCalledWith({
      where: { id: "ca1", situacao: "a_confirmar", gmailRespostaId: "ma1" },
      data: { situacao: "sem_resposta", dataResposta: null, gmailRespostaId: null, regra: null },
    });
  });

  it("audita o estado anterior (de onde se restaura), com ação própria", async () => {
    cenario([], [ANTIGA]);
    await executarFechamento("u1");
    expect(mocks.db.auditLog.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "u1",
          acao: "fechar_consulta_dispensada",
          detalhes: {
            consultaId: "ca1",
            gmailMensagemId: "ma1",
            motivo: "a_confirmar_sem_leitura_da_ia_out_dez_2025",
            situacaoAnterior: "a_confirmar",
            regraAnterior: "sinais_ambiguos",
            dataRespostaAnterior: D_2025.toISOString(),
          },
        },
      ],
    });
  });

  it("consulta que mudou no meio (0 linhas): não conta e não audita", async () => {
    cenario([], [ANTIGA]);
    mocks.db.consultaCotacao.updateMany.mockResolvedValue({ count: 0 });
    const r = await executarFechamento("u1");
    expect(r.consultasDispensadas).toBe(0);
    expect(mocks.db.auditLog.createMany).not.toHaveBeenCalled();
  });

  it("erro numa consulta não derruba as outras", async () => {
    cenario([], [ANTIGA, { ...ANTIGA, m: "ma2", k: "ca2" }]);
    mocks.db.consultaCotacao.updateMany.mockRejectedValueOnce(new Error("falha")).mockResolvedValue({ count: 1 });
    const r = await executarFechamento("u1");
    expect(r.consultasDispensadas).toBe(1);
  });

  it("não depende da chave da IA: roda mesmo com a aplicação da IA desligada", async () => {
    mocks.ligada.mockReturnValue(false);
    cenario([], [ANTIGA]);
    const r = await executarFechamento("u1");
    expect(r.iaDesligada).toBe(true);
    expect(r.consultasDispensadas).toBe(1);
  });
});
