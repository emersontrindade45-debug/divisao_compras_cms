import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exemplos: { findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  consultas: { findMany: vi.fn() },
  conferencias: { findMany: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  db: { exemploClassificacaoIa: mocks.exemplos, consultaCotacao: mocks.consultas, conferenciaIaResposta: mocks.conferencias },
}));

import {
  anexarExemplos,
  anexarExemplosSeLigado,
  apagarTodosOsExemplos,
  carregarExemplos,
  coletarExemplos,
  exemplosLigados,
  MAX_COLETA_POR_RODADA,
} from "../exemplosIa";

const original = { flag: process.env.IA_EXEMPLOS, url: process.env.APPS_SCRIPT_URL, seg: process.env.APPS_SCRIPT_SEGREDO };
function restaurar(nome: string, v: string | undefined) {
  if (v === undefined) delete process.env[nome];
  else process.env[nome] = v;
}

describe("exemplosLigados", () => {
  afterEach(() => restaurar("IA_EXEMPLOS", original.flag));

  it.each([[undefined], [""], ["0"], ["true"], ["sim"], ["1 "]])("desligado quando a variável é %s", (v) => {
    if (v === undefined) delete process.env.IA_EXEMPLOS;
    else process.env.IA_EXEMPLOS = v;
    expect(exemplosLigados()).toBe(false);
  });

  it("ligado SÓ com o valor exato 1", () => {
    process.env.IA_EXEMPLOS = "1";
    expect(exemplosLigados()).toBe(true);
  });
});

describe("carregarExemplos / anexarExemplos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lê com select explícito e devolve no formato do domínio, descartando classe desconhecida", async () => {
    mocks.exemplos.findMany.mockResolvedValue([
      { gmailMensagemId: "m1", classeCorreta: "recusa", trecho: "não trabalhamos com esse item" },
      { gmailMensagemId: "m2", classeCorreta: "classe_inventada", trecho: "x" },
    ]);
    expect(await carregarExemplos()).toEqual([{ id: "m1", classe: "recusa", trecho: "não trabalhamos com esse item" }]);
    expect(mocks.exemplos.findMany).toHaveBeenCalledWith({
      select: { gmailMensagemId: true, classeCorreta: true, trecho: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });
  });

  it("tabela ausente ou banco fora: a IA lê sem exemplo, não quebra", async () => {
    mocks.exemplos.findMany.mockRejectedValue(new Error('relation "exemplos_classificacao_ia" does not exist'));
    expect(await carregarExemplos()).toEqual([]);
  });

  it("cada item recebe os seus exemplos, e o próprio caso nunca é exemplo dele mesmo", () => {
    const itens = [
      { id: "m1", trecho: "não trabalhamos com esse item" },
      { id: "m9", trecho: "cadeira giratória ergonômica" },
    ];
    const exemplos = [
      { id: "m1", classe: "recusa" as const, trecho: "não trabalhamos com esse item" },
      { id: "m2", classe: "recusa" as const, trecho: "não trabalhamos com esse produto, fora do ramo" },
    ];
    const r = anexarExemplos(itens, exemplos);
    expect(r[0]!.exemplos).toEqual([{ classe: "recusa", trecho: "não trabalhamos com esse produto, fora do ramo" }]);
    expect(r[1]!.exemplos).toBeUndefined(); // nada parecido: sem bloco
  });

  it("sem exemplos guardados devolve os MESMOS itens (identidade, nada copiado)", () => {
    const itens = [{ id: "a", trecho: "x" }];
    expect(anexarExemplos(itens, [])).toBe(itens);
  });

  describe("anexarExemplosSeLigado", () => {
    afterEach(() => restaurar("IA_EXEMPLOS", original.flag));

    it("flag desligada: não lê o banco e devolve os mesmos itens", async () => {
      delete process.env.IA_EXEMPLOS;
      const itens = [{ id: "a", trecho: "não trabalhamos com esse item" }];
      expect(await anexarExemplosSeLigado(itens)).toBe(itens);
      expect(mocks.exemplos.findMany).not.toHaveBeenCalled();
    });

    it("flag ligada: lê o banco e anexa", async () => {
      process.env.IA_EXEMPLOS = "1";
      mocks.exemplos.findMany.mockResolvedValue([{ gmailMensagemId: "m2", classeCorreta: "recusa", trecho: "não trabalhamos com esse produto" }]);
      const r = await anexarExemplosSeLigado([{ id: "a", trecho: "não trabalhamos com esse item" }]);
      expect(r[0]!.exemplos).toHaveLength(1);
    });
  });
});

describe("coletarExemplos", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APPS_SCRIPT_URL = "https://script.exemplo/exec";
    process.env.APPS_SCRIPT_SEGREDO = "segredo-do-teste";
    vi.stubGlobal("fetch", fetchMock);
    mocks.consultas.findMany.mockResolvedValue([{ gmailRespostaId: "m1", situacao: "recusa" }]);
    mocks.conferencias.findMany.mockResolvedValue([{ gmailMensagemId: "m2", classeCorreta: "duvida" }]);
    mocks.exemplos.findMany.mockResolvedValue([]);
    mocks.exemplos.createMany.mockImplementation(async (a: { data: unknown[] }) => ({ count: a.data.length }));
    mocks.exemplos.updateMany.mockResolvedValue({ count: 1 });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        trechos: [
          { id: "m1", trecho: "Não trabalhamos com esse item, obrigado.", anexosPdf: 0, anexosOutros: 0 },
          { id: "m2", trecho: "Pode detalhar a quantidade do item 3?", anexosPdf: 1, anexosOutros: 0 },
        ],
      }),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    restaurar("APPS_SCRIPT_URL", original.url);
    restaurar("APPS_SCRIPT_SEGREDO", original.seg);
  });

  it("sem URL ou segredo: nega, sem ler nada do banco nem do Google (fail-closed)", async () => {
    delete process.env.APPS_SCRIPT_SEGREDO;
    const r = await coletarExemplos();
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.consultas.findMany).not.toHaveBeenCalled();
  });

  it("só decisões HUMANAS: manual (consulta) e conferência, nunca a leitura da IA", async () => {
    await coletarExemplos();
    expect(mocks.consultas.findMany).toHaveBeenCalledWith({
      where: { regra: "manual", gmailRespostaId: { not: null }, situacao: { in: ["orcamento", "recusa", "duvida"] } },
      select: { gmailRespostaId: true, situacao: true },
    });
    expect(mocks.conferencias.findMany).toHaveBeenCalledWith({ select: { gmailMensagemId: true, classeCorreta: true } });
  });

  it("pede ao script só os ids decididos e grava com a classe do analista e a origem", async () => {
    const r = await coletarExemplos();
    const enviado = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(enviado).toMatchObject({ acao: "trechos", segredo: "segredo-do-teste" });
    expect([...enviado.ids].sort()).toEqual(["m1", "m2"]);
    expect(mocks.exemplos.createMany).toHaveBeenCalledWith({
      data: [
        { gmailMensagemId: "m1", classeCorreta: "recusa", origem: "manual", trecho: "Não trabalhamos com esse item, obrigado.", anexosPdf: 0, anexosOutros: 0 },
        { gmailMensagemId: "m2", classeCorreta: "duvida", origem: "conferencia", trecho: "Pode detalhar a quantidade do item 3?", anexosPdf: 1, anexosOutros: 0 },
      ],
      skipDuplicates: true,
    });
    expect(r).toMatchObject({ ok: true, resultado: { decisoes: 2, pedidos: 2, gravados: 2, restantes: 0 } });
  });

  it("a conferência VENCE a decisão manual do mesmo caso (ela diz a classe certa)", async () => {
    mocks.consultas.findMany.mockResolvedValue([{ gmailRespostaId: "m2", situacao: "orcamento" }]);
    await coletarExemplos();
    const gravado = (mocks.exemplos.createMany.mock.calls[0]![0] as { data: Array<{ gmailMensagemId: string; classeCorreta: string; origem: string }> }).data;
    expect(gravado.find((g) => g.gmailMensagemId === "m2")).toMatchObject({ classeCorreta: "duvida", origem: "conferencia" });
  });

  it("trecho que AINDA parece dado pessoal é recusado e NUNCA gravado; só o nome da regra é contado", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        trechos: [
          { id: "m1", trecho: "Responda para fulano@empresa.com.br com o preço" },
          { id: "m2", trecho: "Pode detalhar a quantidade do item 3?" },
        ],
      }),
    });
    const r = await coletarExemplos();
    const gravado = (mocks.exemplos.createMany.mock.calls[0]![0] as { data: Array<{ trecho: string }> }).data;
    expect(gravado).toHaveLength(1);
    expect(JSON.stringify(gravado)).not.toContain("fulano@");
    expect(r).toMatchObject({ ok: true, resultado: { gravados: 1, rejeitados: { email: 1 } } });
    expect(JSON.stringify(r)).not.toContain("fulano");
  });

  it("id que não foi pedido ou repetido na resposta é ignorado", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        trechos: [
          { id: "intruso", trecho: "Texto de uma mensagem que ninguém pediu aqui" },
          { id: "m1", trecho: "Não trabalhamos com esse item, obrigado." },
          { id: "m1", trecho: "Outro texto para o mesmo id, que deve ser ignorado" },
        ],
      }),
    });
    const r = await coletarExemplos();
    const gravado = (mocks.exemplos.createMany.mock.calls[0]![0] as { data: Array<{ gmailMensagemId: string }> }).data;
    expect(gravado.map((g) => g.gmailMensagemId)).toEqual(["m1"]);
    expect(r).toMatchObject({ ok: true, resultado: { gravados: 1, semTexto: 1 } });
  });

  it("não pede de novo o que já tem exemplo", async () => {
    mocks.exemplos.findMany.mockResolvedValue([{ gmailMensagemId: "m1", classeCorreta: "recusa" }]);
    await coletarExemplos();
    const enviado = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(enviado.ids).toEqual(["m2"]);
  });

  it("tudo já coletado: não chama o Google", async () => {
    mocks.exemplos.findMany.mockResolvedValue([
      { gmailMensagemId: "m1", classeCorreta: "recusa" },
      { gmailMensagemId: "m2", classeCorreta: "duvida" },
    ]);
    const r = await coletarExemplos();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, resultado: { pedidos: 0, jaTinham: 2, restantes: 0 } });
  });

  it(`pede no máximo ${MAX_COLETA_POR_RODADA} por rodada e diz quantos restam`, async () => {
    mocks.consultas.findMany.mockResolvedValue(Array.from({ length: 45 }, (_, i) => ({ gmailRespostaId: `x${i}`, situacao: "recusa" })));
    mocks.conferencias.findMany.mockResolvedValue([]);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ trechos: [] }) });
    const r = await coletarExemplos();
    const enviado = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(enviado.ids).toHaveLength(MAX_COLETA_POR_RODADA);
    expect(r).toMatchObject({ ok: true, resultado: { pedidos: 30, restantes: 45, semTexto: 30 } });
  });

  it("decisão corrigida depois: atualiza só a classe do exemplo existente, com guarda no WHERE", async () => {
    mocks.exemplos.findMany.mockResolvedValue([{ gmailMensagemId: "m1", classeCorreta: "orcamento" }, { gmailMensagemId: "m2", classeCorreta: "duvida" }]);
    const r = await coletarExemplos();
    expect(mocks.exemplos.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.exemplos.updateMany).toHaveBeenCalledWith({
      where: { gmailMensagemId: "m1", classeCorreta: "orcamento" },
      data: { classeCorreta: "recusa", origem: "manual" },
    });
    expect(r).toMatchObject({ ok: true, resultado: { atualizados: 1 } });
  });

  it("falha do Google (HTTP ou rede): erro com texto fixo, nada gravado", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    expect(await coletarExemplos()).toMatchObject({ ok: false });
    fetchMock.mockRejectedValue(new Error("segredo-do-teste vazou aqui"));
    const r = await coletarExemplos();
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("segredo-do-teste");
    expect(mocks.exemplos.createMany).not.toHaveBeenCalled();
  });

  it("resposta fora do formato (script sem a ação `trechos`): erro explicativo, nada gravado", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ envios: [], respostas: [] }) });
    const r = await coletarExemplos();
    expect(r).toMatchObject({ ok: false });
    expect((r as { erro: string }).erro).toMatch(/script do Google foi atualizado/);
    expect(mocks.exemplos.createMany).not.toHaveBeenCalled();
  });
});

describe("apagarTodosOsExemplos", () => {
  it("apaga tudo e devolve a contagem", async () => {
    mocks.exemplos.deleteMany.mockResolvedValue({ count: 7 });
    expect(await apagarTodosOsExemplos()).toBe(7);
    expect(mocks.exemplos.deleteMany).toHaveBeenCalledWith({});
  });
});
