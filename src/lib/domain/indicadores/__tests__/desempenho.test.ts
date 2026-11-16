import { describe, expect, it } from "vitest";
import {
  consultasComoCotacoes,
  percentualEmailsInvalidos,
  taxaRespostaConsultas,
  tempoRespostaDias,
  type ConsultaDesempenhoInput,
  janelas,
  lerPeriodo,
  mediaFontesAteSuficiencia,
  normalizarCategoria,
  percentualFontePublica,
  percentualPropostasInvalidas,
  taxaResposta,
  taxaRespostaPorCategoria,
  tempoAteMarco,
  textoCobertura,
  variacao,
  type CotacaoDesempenhoInput,
  type ProcessoTempoInput,
} from "../desempenho";

const AGORA = new Date("2026-11-16T12:00:00Z");
const { atual: J, anterior: JA } = janelas("30d", AGORA);
const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe("janelas", () => {
  it("janela atual de 30 dias e a anterior contígua, de mesmo tamanho", () => {
    expect(J.inicio.toISOString()).toBe("2026-10-17T12:00:00.000Z");
    expect(J.fim).toEqual(AGORA);
    expect(JA.fim).toEqual(J.inicio);
    expect(JA.inicio.toISOString()).toBe("2026-09-17T12:00:00.000Z");
  });

  it("período desconhecido cai no padrão de 90 dias", () => {
    expect(lerPeriodo("xpto")).toBe("90d");
    expect(lerPeriodo("12m")).toBe("12m");
  });
});

function proc(over: Partial<ProcessoTempoInput> = {}): ProcessoTempoInput {
  return {
    dataAbertura: d("2026-11-01"),
    dataAberturaOrigem: "informada",
    marcosIncertos: false,
    primeiraReferenciaEm: null,
    serieMinimaEm: null,
    ...over,
  };
}

describe("tempoAteMarco", () => {
  it("mediana em dias, só com data confiável, e conta os excluídos", () => {
    const r = tempoAteMarco(
      [
        proc({ primeiraReferenciaEm: d("2026-11-03") }), // 2 dias
        proc({ primeiraReferenciaEm: d("2026-11-05") }), // 4 dias
        proc({ primeiraReferenciaEm: d("2026-11-11") }), // 10 dias
        // Fora da conta: data de importação e marcos incertos.
        proc({ dataAberturaOrigem: "importacao", primeiraReferenciaEm: d("2026-11-02") }),
        proc({ marcosIncertos: true, primeiraReferenciaEm: d("2026-11-02") }),
        // Fora da janela: não é universo.
        proc({ primeiraReferenciaEm: d("2026-09-01") }),
      ],
      "primeiraReferenciaEm",
      J,
    );
    // Média seria 5,3; a mediana é 4 — o teste distingue as duas.
    expect(r).toEqual({ valor: 4, base: 3, excluidos: 2 });
  });

  it("janela pelo instante do MARCO, não pela abertura", () => {
    const r = tempoAteMarco(
      [proc({ dataAbertura: d("2026-08-01"), serieMinimaEm: d("2026-11-01") })],
      "serieMinimaEm",
      J,
    );
    expect(r.base).toBe(1);
    expect(r.valor).toBe(92);
  });

  it("sem caso, valor nulo (não zero)", () => {
    expect(tempoAteMarco([], "serieMinimaEm", J)).toEqual({ valor: null, base: 0, excluidos: 0 });
  });

  it("marco antes da abertura informada conta zero, nunca negativo", () => {
    const r = tempoAteMarco(
      [proc({ dataAbertura: d("2026-11-10"), primeiraReferenciaEm: d("2026-11-01") })],
      "primeiraReferenciaEm",
      J,
    );
    expect(r.valor).toBe(0);
  });
});

describe("percentualFontePublica", () => {
  it("entre processos abertos no período e com preço; sem preço fica fora", () => {
    const r = percentualFontePublica(
      [
        { dataAbertura: d("2026-11-01"), temPreco: true, temPrecoPublico: true },
        { dataAbertura: d("2026-11-01"), temPreco: true, temPrecoPublico: false },
        { dataAbertura: d("2026-11-01"), temPreco: true, temPrecoPublico: true },
        { dataAbertura: d("2026-11-01"), temPreco: false, temPrecoPublico: false },
        { dataAbertura: d("2026-01-01"), temPreco: true, temPrecoPublico: false },
      ],
      J,
    );
    // Contando os sem preço no denominador daria 50%; o certo é 2 de 3.
    expect(r).toEqual({ valor: 67, base: 3, excluidos: 1 });
  });
});

function cot(over: Partial<CotacaoDesempenhoInput> = {}): CotacaoDesempenhoInput {
  return { dataEnvio: d("2026-11-01"), status: "silenciosa", categorias: [], ...over };
}

describe("taxaResposta", () => {
  it("recusa conta como resposta; só cotações enviadas no período", () => {
    const r = taxaResposta(
      [
        cot({ status: "positiva" }),
        cot({ status: "negativa" }),
        cot({ status: "silenciosa" }),
        cot({ status: "silenciosa" }),
        cot({ status: "positiva", dataEnvio: d("2026-01-01") }),
      ],
      J,
    );
    expect(r).toEqual({ valor: 50, base: 4, excluidos: 0 });
  });
});

describe("taxaRespostaPorCategoria", () => {
  it("grafias equivalentes somam juntas; sem categoria tem grupo próprio", () => {
    const r = taxaRespostaPorCategoria(
      [
        cot({ categorias: ["Informática"], status: "positiva" }),
        cot({ categorias: [" informatica "], status: "silenciosa" }),
        cot({ categorias: ["INFORMÁTICA", "Papelaria"], status: "negativa" }),
        cot({ categorias: [], status: "silenciosa" }),
      ],
      J,
    );
    expect(r).toEqual([
      { categoria: "Informática", enviadas: 3, respondidas: 2, taxa: 67 },
      { categoria: "Papelaria", enviadas: 1, respondidas: 1, taxa: 100 },
      { categoria: "Sem categoria", enviadas: 1, respondidas: 0, taxa: 0 },
    ]);
  });

  it("categoria repetida no mesmo fornecedor conta uma vez", () => {
    const r = taxaRespostaPorCategoria([cot({ categorias: ["TI", "ti"], status: "positiva" })], J);
    expect(r).toEqual([{ categoria: "TI", enviadas: 1, respondidas: 1, taxa: 100 }]);
  });

  it("normalizarCategoria tira acento, caixa e espaço extra", () => {
    expect(normalizarCategoria("  Material   de  Limpeza  ")).toBe("material de limpeza");
    expect(normalizarCategoria("Construção")).toBe("construcao");
  });
});

describe("percentualPropostasInvalidas", () => {
  it("com ressalva não é invalidada", () => {
    const r = percentualPropostasInvalidas(
      [
        { createdAt: d("2026-11-01"), statusGeral: "invalida" },
        { createdAt: d("2026-11-01"), statusGeral: "com_ressalva" },
        { createdAt: d("2026-11-01"), statusGeral: "valida" },
        { createdAt: d("2026-11-01"), statusGeral: "valida" },
      ],
      J,
    );
    expect(r).toEqual({ valor: 25, base: 4, excluidos: 0 });
  });
});

describe("mediaFontesAteSuficiencia", () => {
  it("média de pesquisados só nos itens que chegaram a 3 incluídos", () => {
    const r = mediaFontesAteSuficiencia(
      [
        { dataAbertura: d("2026-11-01"), incluidos: 3, pesquisados: 4 },
        { dataAbertura: d("2026-11-01"), incluidos: 5, pesquisados: 7 },
        { dataAbertura: d("2026-11-01"), incluidos: 2, pesquisados: 9 },
      ],
      J,
    );
    expect(r).toEqual({ valor: 5.5, base: 2, excluidos: 1 });
  });
});

describe("variacao", () => {
  const ind = (valor: number | null) => ({ valor, base: 1, excluidos: 0 });

  it("tempo menor é melhora", () => {
    expect(variacao(ind(4), ind(6), "menor_melhor")).toEqual({ diferenca: -2, melhorou: true });
  });
  it("taxa maior é melhora", () => {
    expect(variacao(ind(60), ind(50), "maior_melhor")).toEqual({ diferenca: 10, melhorou: true });
    expect(variacao(ind(40), ind(50), "maior_melhor")).toEqual({ diferenca: -10, melhorou: false });
  });
  it("sem base em algum período, não há comparação", () => {
    expect(variacao(ind(4), ind(null), "menor_melhor")).toBeNull();
    expect(variacao(ind(4), ind(4), "menor_melhor")).toBeNull();
  });
});


describe("textoCobertura", () => {
  const p = { singular: "processo", plural: "processos" };
  it("diz a base e os excluídos com o motivo", () => {
    expect(textoCobertura({ valor: 4, base: 18, excluidos: 7 }, p, "sem data confiável")).toBe(
      "sobre 18 processos · 7 sem data confiável",
    );
  });
  it("singular e sem excluídos", () => {
    expect(textoCobertura({ valor: 4, base: 1, excluidos: 0 }, p, "x")).toBe("sobre 1 processo");
  });
  it("sem caso nenhum", () => {
    expect(textoCobertura({ valor: null, base: 0, excluidos: 0 }, p)).toBe("nenhum caso no período");
  });
});

function cons(over: Partial<ConsultaDesempenhoInput> = {}): ConsultaDesempenhoInput {
  return { dataEnvio: d("2026-11-01"), dataResposta: null, situacao: "sem_resposta", categoria: null, ...over };
}

describe("indicadores das consultas por e-mail (M30.d)", () => {
  it("e-mail que voltou não conta como silêncio: sai da base e aparece na cobertura", () => {
    const r = taxaRespostaConsultas(
      [
        cons({ situacao: "orcamento", dataResposta: d("2026-11-03") }),
        cons({ situacao: "sem_resposta" }),
        cons({ situacao: "email_invalido" }),
        cons({ situacao: "email_invalido" }),
      ],
      J,
    );
    // Contando as devoluções como "sem resposta", seria 1 de 4 = 25%; o certo é 1 de 2.
    expect(r).toEqual({ valor: 50, base: 2, excluidos: 2 });
  });

  it("'a confirmar' já é uma resposta (só não se sabe de que tipo)", () => {
    const r = taxaRespostaConsultas(
      [cons({ situacao: "a_confirmar", dataResposta: d("2026-11-03") }), cons({ situacao: "sem_resposta" })],
      J,
    );
    expect(r.valor).toBe(50);
  });

  it("consultasComoCotacoes leva o CNAE como categoria e deixa o sem dono sem categoria", () => {
    const out = consultasComoCotacoes([
      cons({ situacao: "recusa", categoria: "Papelaria" }),
      cons({ situacao: "orcamento", categoria: null }),
    ]);
    expect(out.map((c) => [c.status, c.categorias])).toEqual([
      ["negativa", ["Papelaria"]],
      ["positiva", []],
    ]);
  });

  it("tempo de resposta: mediana em dias, só de quem respondeu na janela", () => {
    const r = tempoRespostaDias(
      [
        cons({ situacao: "orcamento", dataResposta: d("2026-11-03") }), // 2 dias
        cons({ situacao: "recusa", dataResposta: d("2026-11-05") }), // 4 dias
        cons({ situacao: "orcamento", dataResposta: d("2026-11-11") }), // 10 dias
        cons({ situacao: "sem_resposta" }),
        cons({ situacao: "email_invalido", dataResposta: d("2026-11-02") }), // devolução não é resposta
        cons({ situacao: "orcamento", dataResposta: d("2026-09-01"), dataEnvio: d("2026-08-30") }), // fora da janela
      ],
      J,
    );
    // Média seria 5,3 — a mediana é 4.
    expect(r).toEqual({ valor: 4, base: 3, excluidos: 0 });
  });

  it("tempo de resposta nunca é negativo", () => {
    const r = tempoRespostaDias([cons({ situacao: "orcamento", dataEnvio: d("2026-11-10"), dataResposta: d("2026-11-09") })], J);
    expect(r.valor).toBe(0);
  });

  it("% de e-mails que voltaram, sobre o que foi enviado na janela", () => {
    const r = percentualEmailsInvalidos(
      [
        cons({ situacao: "email_invalido" }),
        cons({ situacao: "sem_resposta" }),
        cons({ situacao: "orcamento" }),
        cons({ situacao: "orcamento" }),
        cons({ situacao: "email_invalido", dataEnvio: d("2026-01-01") }), // fora da janela
      ],
      J,
    );
    expect(r).toEqual({ valor: 25, base: 4, excluidos: 0 });
  });
});
