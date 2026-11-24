import { describe, expect, it } from "vitest";
import type { FraseMudou, ProcessoDetalhado } from "../painelDemanda";
import {
  dataBr,
  frasePlana,
  numeroCurto,
  pct,
  processosDoKpi,
  rotuloDaCategoria,
  trechosDaFrase,
  variacaoEmNumero,
  variacaoEmPp,
} from "../formatosPainel";

describe("formatos", () => {
  it("pct usa vírgula e uma casa", () => {
    expect(pct(0.5465)).toBe("54,7%");
    expect(pct(0)).toBe("0,0%");
    expect(pct(1)).toBe("100,0%");
  });
  it("numeroCurto não mostra casa decimal inútil", () => {
    expect(numeroCurto(8)).toBe("8");
    expect(numeroCurto(8.5)).toBe("8,5");
    expect(numeroCurto(5.0512)).toBe("5,1");
  });
  it("dataBr não depende de fuso", () => {
    expect(dataBr("2026-11-17")).toBe("17/11/2026");
  });
  it("rotuloDaCategoria", () => {
    expect(rotuloDaCategoria("servicos")).toBe("Aquisição de Serviços");
    expect(rotuloDaCategoria("desconhecida")).toBe("desconhecida");
  });
});

describe("variações", () => {
  it("queda de devolução é BOA; alta é RUIM", () => {
    expect(variacaoEmPp(0.5465, 0.6003, true)).toEqual({ texto: "−5,4 p.p.", tom: "bom" });
    expect(variacaoEmPp(0.6, 0.5, true)).toEqual({ texto: "+10,0 p.p.", tom: "ruim" });
  });
  it("boaQuandoCai = null (volume): nunca bom nem ruim", () => {
    expect(variacaoEmPp(0.6, 0.5, null)?.tom).toBe("neutro");
  });
  it("variação menor que 0,05 vira neutra e sem sinal", () => {
    expect(variacaoEmPp(0.5001, 0.5, true)).toEqual({ texto: "0,0 p.p.", tom: "neutro" });
  });
  it("sem comparativo: null, não zero", () => {
    expect(variacaoEmPp(0.5, null, true)).toBeNull();
    expect(variacaoEmNumero(5, null, true)).toBeNull();
  });
  it("variação em número com unidade", () => {
    expect(variacaoEmNumero(8.5, 8, true, " dias")).toEqual({ texto: "+0,5 dias", tom: "ruim" });
    expect(variacaoEmNumero(5.05, 5.87, true)).toEqual({ texto: "−0,8", tom: "bom" });
  });
});

const proc = (chave: string, passagens: number, intervalo: number | null): ProcessoDetalhado => ({
  chave,
  rotulo: `Geral Nº ${chave} - volume 1`,
  categoria: "geral",
  passagens,
  devolucoes: Math.max(0, passagens - 3),
  nivel: "normal",
  primeira: "2026-01-01",
  ultima: "2026-02-01",
  intervaloMedianoDias: intervalo,
  maiorIntervaloDias: intervalo,
  diasSemNovaPassagem: null,
  historico: [],
});

describe("processosDoKpi", () => {
  const todos = [
    proc("1/2026", 2, 3),
    proc("2/2026", 9, 12),
    proc("3/2026", 5, 7),
    proc("4/2026", 1, null),
    proc("5/2026", 9, 4),
  ];
  it("devoluções: só quem tem devolução, mais devoluções primeiro, empate pela chave", () => {
    expect(processosDoKpi(todos, "devolucoes").map((p) => p.chave)).toEqual([
      "2/2026",
      "5/2026",
      "3/2026",
    ]);
  });
  it("devolvidos: mais de 3 passagens", () => {
    expect(processosDoKpi(todos, "devolvidos").map((p) => p.chave)).toEqual([
      "2/2026",
      "5/2026",
      "3/2026",
    ]);
    expect(processosDoKpi([proc("1/2026", 3, 1)], "devolvidos")).toEqual([]);
  });
  it("passagens: todos, mais passagens primeiro", () => {
    expect(processosDoKpi(todos, "passagens").map((p) => p.chave)).toEqual([
      "2/2026",
      "5/2026",
      "3/2026",
      "1/2026",
      "4/2026",
    ]);
  });
  it("intervalo: só quem tem 2+ passagens, maior intervalo primeiro", () => {
    expect(processosDoKpi(todos, "intervalo").map((p) => p.chave)).toEqual([
      "2/2026",
      "3/2026",
      "5/2026",
      "1/2026",
    ]);
  });
  it("não altera a lista original", () => {
    const copia = [...todos];
    processosDoKpi(todos, "passagens");
    expect(todos).toEqual(copia);
  });
});

describe("trechosDaFrase", () => {
  const plana = (f: FraseMudou) => frasePlana(trechosDaFrase(f));
  it("remessas dos 7 dias: singular, plural e variação", () => {
    expect(
      plana({
        codigo: "remessas_7d",
        tendencia: "neutra",
        atual: 7,
        anterior: 22,
        variacaoPct: -15 / 22,
      }),
    ).toBe("Nos últimos 7 dias chegaram 7 remessas (22 nos 7 dias anteriores, −68,2%).");
    expect(
      plana({
        codigo: "remessas_7d",
        tendencia: "neutra",
        atual: 1,
        anterior: 0,
        variacaoPct: null,
      }),
    ).toBe("Nos últimos 7 dias chegou 1 remessa (0 nos 7 dias anteriores).");
  });
  it("devolução dos 30 dias, em pontos percentuais", () => {
    expect(
      plana({
        codigo: "devolucao_30d",
        tendencia: "piora",
        atual: 0.7273,
        anterior: 0.617,
        deltaPp: 11.03,
      }),
    ).toBe(
      "Nos últimos 30 dias, 72,7% das passagens foram devoluções (61,7% nos 30 dias anteriores; +11,0 p.p.).",
    );
  });
  it("críticos novos: singular, lista com 'e' quando cabem todos, e 'e mais N' quando passa de 3", () => {
    const p = (n: number) => ({
      chave: `${n}/2026`,
      rotulo: `Geral Nº ${n}/2026 - volume 1`,
      passagens: 7,
    });
    expect(
      plana({ codigo: "criticos_novos", tendencia: "piora", total: 1, processos: [p(1)] }),
    ).toBe(
      "1 processo chegou à 7ª passagem (nível crítico) nos últimos 30 dias: Geral Nº 1/2026 - volume 1.",
    );
    expect(
      plana({ codigo: "criticos_novos", tendencia: "piora", total: 2, processos: [p(1), p(2)] }),
    ).toBe(
      "2 processos chegaram à 7ª passagem (nível crítico) nos últimos 30 dias: Geral Nº 1/2026 - volume 1 e Geral Nº 2/2026 - volume 1.",
    );
    expect(
      plana({
        codigo: "criticos_novos",
        tendencia: "piora",
        total: 5,
        processos: [p(1), p(2), p(3)],
      }),
    ).toBe(
      "5 processos chegaram à 7ª passagem (nível crítico) nos últimos 30 dias: Geral Nº 1/2026 - volume 1, Geral Nº 2/2026 - volume 1, Geral Nº 3/2026 - volume 1 e mais 2.",
    );
  });
  it("os processos da frase viram trechos clicáveis com a chave", () => {
    const trechos = trechosDaFrase({
      codigo: "processo_mais_passagens",
      tendencia: "neutra",
      chave: "110/2026",
      rotulo: "Geral Nº 110/2026 - volume 1",
      passagens: 23,
      ultima: "2026-09-09",
    });
    expect(trechos.filter((x) => x.tipo === "processo")).toEqual([
      { tipo: "processo", texto: "Geral Nº 110/2026 - volume 1", chave: "110/2026" },
    ]);
    expect(frasePlana(trechos)).toBe(
      "O processo com mais passagens é Geral Nº 110/2026 - volume 1: 23 passagens, a última em 09/09/2026.",
    );
  });
  it("categoria líder: com e sem comparativo", () => {
    expect(
      plana({
        codigo: "categoria_maior_devolucao",
        tendencia: "neutra",
        categoria: "servicos",
        taxa: 0.596,
        deltaPpAnoAnterior: -1.2,
      }),
    ).toBe(
      "A maior taxa de devolução no ano é de Aquisição de Serviços: 59,6% (−1,2 p.p. contra o mesmo período do ano anterior).",
    );
    expect(
      plana({
        codigo: "categoria_maior_devolucao",
        tendencia: "neutra",
        categoria: "bens",
        taxa: 0.5,
        deltaPpAnoAnterior: null,
      }),
    ).toBe("A maior taxa de devolução no ano é de Aquisição de Bens: 50,0%.");
  });
});
