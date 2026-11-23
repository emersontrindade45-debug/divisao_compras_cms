import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    conferenciaIaResposta: { findMany: vi.fn(), upsert: vi.fn() },
    classificacaoIaResposta: { findMany: vi.fn(), findUnique: vi.fn() },
    respostaEmailPendente: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { carregarPainelConferencia, registrarConferencia, TAMANHO_PAGINA } from "../conferenciaIa";

const ia = (id: string, classeIa = "recusa", extra: Record<string, unknown> = {}) => ({
  gmailMensagemId: id,
  classeIa,
  confianca: "alta",
  justificativa: "Diz que não atende.",
  aplicadaEm: new Date("2026-11-20T10:00:00Z"),
  desfeitaEm: null,
  ...extra,
});

describe("carregarPainelConferencia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.conferenciaIaResposta.findMany.mockResolvedValue([]);
    mocks.db.classificacaoIaResposta.findMany.mockResolvedValue([]);
    mocks.db.respostaEmailPendente.findMany.mockResolvedValue([]);
  });

  it("escopo 'aplicadas': pede só as aplicadas, com select explícito (§9.46) e sem include", async () => {
    await carregarPainelConferencia({ escopo: "aplicadas" });
    expect(mocks.db.classificacaoIaResposta.findMany).toHaveBeenCalledWith({
      where: { aplicadaEm: { not: null } },
      select: {
        gmailMensagemId: true,
        classeIa: true,
        confianca: true,
        justificativa: true,
        aplicadaEm: true,
        desfeitaEm: true,
      },
    });
  });

  it("escopo 'sugeridas' + classe: pede as NÃO aplicadas daquela classe", async () => {
    await carregarPainelConferencia({ escopo: "sugeridas", classe: "recusa" });
    const arg = mocks.db.classificacaoIaResposta.findMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ aplicadaEm: null, classeIa: "recusa" });
  });

  it("não oferece de novo o que já foi conferido e o resumo usa a classe da IA do banco", async () => {
    mocks.db.conferenciaIaResposta.findMany.mockResolvedValue([
      { gmailMensagemId: "m1", classeCorreta: "recusa" },
      { gmailMensagemId: "m2", classeCorreta: "duvida" },
    ]);
    mocks.db.classificacaoIaResposta.findMany.mockImplementation(async (a: { where: { gmailMensagemId?: unknown } }) =>
      a.where.gmailMensagemId
        ? [ia("m1", "recusa"), ia("m2", "recusa")]
        : [ia("m1", "recusa"), ia("m2", "recusa"), ia("m3", "recusa")],
    );
    const p = await carregarPainelConferencia({ escopo: "aplicadas" });
    if (p.estado !== "ok") throw new Error("esperava ok");
    expect(p.itens.map((i) => i.gmailMensagemId)).toEqual(["m3"]);
    expect(p.conferidasTotal).toBe(2);
    expect(p.resumo.geral).toMatchObject({ conferidas: 2, certas: 1 });
    expect(p.resumo.confusoes).toEqual([{ classeIa: "recusa", classeCorreta: "duvida", quantidade: 1 }]);
  });

  it("mostra uma página e informa quantas sobram (precisa de MAIS que a página para provar o corte)", async () => {
    const todas = Array.from({ length: TAMANHO_PAGINA + 6 }, (_, i) => ia(`m${i}`));
    mocks.db.classificacaoIaResposta.findMany.mockResolvedValue(todas);
    const p = await carregarPainelConferencia({ escopo: "aplicadas" });
    if (p.estado !== "ok") throw new Error("esperava ok");
    expect(p.itens).toHaveLength(20);
    expect(p.restantes).toBe(6);
  });

  it("devolve o link do Gmail e o número do processo da fila", async () => {
    mocks.db.classificacaoIaResposta.findMany.mockResolvedValue([ia("m1", "orcamento", { desfeitaEm: new Date() })]);
    mocks.db.respostaEmailPendente.findMany.mockResolvedValue([
      { gmailMensagemId: "m1", envio: { numeroProcessoAssunto: "382", processo: { numero: "0382/2026" } } },
    ]);
    const p = await carregarPainelConferencia({ escopo: "aplicadas" });
    if (p.estado !== "ok") throw new Error("esperava ok");
    expect(p.itens[0]).toMatchObject({ processoNumero: "0382/2026", aplicada: true, desfeita: true });
    expect(p.itens[0]!.linkGmail).toContain("#all/m1");
  });

  it("ignora classe desconhecida gravada na tabela (não vira botão sem sentido)", async () => {
    mocks.db.classificacaoIaResposta.findMany.mockResolvedValue([ia("m1", "outra_coisa"), ia("m2", "recusa")]);
    const p = await carregarPainelConferencia({ escopo: "aplicadas" });
    if (p.estado !== "ok") throw new Error("esperava ok");
    expect(p.itens.map((i) => i.gmailMensagemId)).toEqual(["m2"]);
  });

  it("falha de leitura vira 'indisponivel', nunca lista vazia (§9.93)", async () => {
    mocks.db.conferenciaIaResposta.findMany.mockRejectedValue(new Error('relation "conferencias_ia_resposta" does not exist'));
    expect(await carregarPainelConferencia({ escopo: "aplicadas" })).toEqual({ estado: "indisponivel" });
  });
});

describe("registrarConferencia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.classificacaoIaResposta.findUnique.mockResolvedValue({ classeIa: "recusa" });
    mocks.db.conferenciaIaResposta.upsert.mockResolvedValue({ id: "c1" });
  });

  it("grava com a classe da IA lida do BANCO e o usuário que conferiu", async () => {
    const r = await registrarConferencia("m1", "duvida", "u1");
    expect(r).toEqual({ tipo: "ok", certa: false, classeIa: "recusa" });
    expect(mocks.db.conferenciaIaResposta.upsert).toHaveBeenCalledWith({
      where: { gmailMensagemId: "m1" },
      create: { gmailMensagemId: "m1", userId: "u1", classeCorreta: "duvida", classeIa: "recusa" },
      update: { userId: "u1", classeCorreta: "duvida", classeIa: "recusa" },
      select: { id: true },
    });
  });

  it("marca como certa quando a classe confere", async () => {
    expect(await registrarConferencia("m1", "recusa", "u1")).toMatchObject({ certa: true });
  });

  it("classificação inexistente: erro e NADA é gravado", async () => {
    mocks.db.classificacaoIaResposta.findUnique.mockResolvedValue(null);
    expect(await registrarConferencia("nao-existe", "recusa", "u1")).toEqual({
      tipo: "erro",
      mensagem: "Classificação não encontrada.",
    });
    expect(mocks.db.conferenciaIaResposta.upsert).not.toHaveBeenCalled();
  });
});
