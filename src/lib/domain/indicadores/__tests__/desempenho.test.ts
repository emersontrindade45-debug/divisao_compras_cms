import { describe, expect, it } from "vitest";
import {
  consultasComoCotacoes,
  percentualEmailsInvalidos,
  taxaRespostaConsultas,
  contarConsultas,
  percentualDaSituacao,
  tempoRespostaDias,
  type ConsultaDesempenhoInput,
  janelas,
  tituloPeriodo,
  lerPeriodo,
  mediaFontesAteSuficiencia,
  referenciaProcesso,
  SEM_PROCESSO,
  type ProcessoRef,
  percentualFontePublica,
  percentualPropostasInvalidas,
  taxaResposta,
  taxaRespostaPorProcesso,
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

const P1: ProcessoRef = { chave: "p:1", rotulo: "0736/2025" };
const P2: ProcessoRef = { chave: "p:2", rotulo: "1829/2024" };

function cot(over: Partial<CotacaoDesempenhoInput> = {}): CotacaoDesempenhoInput {
  return { dataEnvio: d("2026-11-01"), status: "silenciosa", processo: P1, ...over };
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

describe("taxaRespostaPorProcesso", () => {
  it("agrupa por processo, recusa conta como resposta, ordena por volume enviado", () => {
    const r = taxaRespostaPorProcesso(
      [
        cot({ processo: P1, status: "positiva" }),
        cot({ processo: P1, status: "negativa" }),
        cot({ processo: P1, status: "silenciosa" }),
        cot({ processo: P2, status: "silenciosa" }),
      ],
      J,
    );
    expect(r).toEqual([
      { chave: "p:1", processo: "0736/2025", enviadas: 3, respondidas: 2, taxa: 67 },
      { chave: "p:2", processo: "1829/2024", enviadas: 1, respondidas: 0, taxa: 0 },
    ]);
  });

  it("só conta o que foi enviado na janela", () => {
    const r = taxaRespostaPorProcesso(
      [cot({ status: "positiva" }), cot({ status: "positiva", dataEnvio: d("2026-01-01") })],
      J,
    );
    expect(r).toEqual([{ chave: "p:1", processo: "0736/2025", enviadas: 1, respondidas: 1, taxa: 100 }]);
  });

  it("a chave decide o grupo, não o rótulo: dois processos com o mesmo texto ficam separados", () => {
    const r = taxaRespostaPorProcesso(
      [
        cot({ processo: { chave: "p:1", rotulo: "X" } }),
        cot({ processo: { chave: "p:2", rotulo: "X" } }),
      ],
      J,
    );
    expect(r).toHaveLength(2);
  });
});

describe("referenciaProcesso", () => {
  it("vinculado usa o número cadastrado", () => {
    expect(
      referenciaProcesso({ processoId: "abc", processoNumero: "0736/2025", numeroProcessoAssunto: "736" }),
    ).toEqual({ chave: "p:abc", rotulo: "0736/2025" });
  });

  it("sem vínculo mas com número no assunto: mostra o número e marca como não cadastrado", () => {
    expect(
      referenciaProcesso({ processoId: null, processoNumero: null, numeroProcessoAssunto: " 382 " }),
    ).toEqual({ chave: "a:382", rotulo: "Nº 382 · não cadastrado" });
  });

  it("sem nada, um grupo único", () => {
    expect(
      referenciaProcesso({ processoId: null, processoNumero: null, numeroProcessoAssunto: null }),
    ).toBe(SEM_PROCESSO);
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
  return { dataEnvio: d("2026-11-01"), dataResposta: null, situacao: "sem_resposta", processo: P1, ...over };
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

  it("'a confirmar' NÃO conta como resposta (pode ser só 'recebi'); só orçamento e recusa contam", () => {
    const r = taxaRespostaConsultas(
      [
        cons({ situacao: "a_confirmar", dataResposta: d("2026-11-03") }),
        cons({ situacao: "orcamento", dataResposta: d("2026-11-03") }),
        cons({ situacao: "sem_resposta" }),
        cons({ situacao: "sem_resposta" }),
      ],
      J,
    );
    expect(r.valor).toBe(25);
  });

  describe("respostas classificadas pela IA sem fornecedor ligado", () => {
    const sem = (situacao: "orcamento" | "recusa" | "duvida") => cons({ situacao, semFornecedor: true, dataResposta: d("2026-11-03") });

    it("somam ao numerador da categoria e NÃO ao denominador (a consulta do fornecedor já está nele)", () => {
      const consultas = [cons({ situacao: "recusa" }), cons({ situacao: "sem_resposta" }), sem("recusa"), sem("orcamento"), sem("duvida")];
      const c = contarConsultas(consultas, J);
      expect(c).toMatchObject({ consultadas: 2, recusas: 2, orcamentos: 1, duvidas: 1 });
      expect(percentualDaSituacao(consultas, J, "recusa")).toMatchObject({ valor: 100, base: 2 });
    });

    it("ficam fora da taxa de resposta, do tempo de resposta e dos e-mails devolvidos", () => {
      const base = [cons({ situacao: "orcamento", dataResposta: d("2026-11-03") }), cons({ situacao: "sem_resposta" })];
      const comSem = [...base, sem("recusa"), sem("duvida")];
      expect(taxaRespostaConsultas(comSem, J)).toEqual(taxaRespostaConsultas(base, J));
      expect(tempoRespostaDias(comSem, J)).toEqual(tempoRespostaDias(base, J));
      expect(percentualEmailsInvalidos(comSem, J)).toEqual(percentualEmailsInvalidos(base, J));
      expect(consultasComoCotacoes(comSem)).toHaveLength(2);
    });

    it("respeitam a janela de datas como as demais", () => {
      const fora = cons({ situacao: "recusa", semFornecedor: true, dataEnvio: d("2026-01-01") });
      expect(contarConsultas([fora], J).recusas).toBe(0);
    });
  });

  it("contarConsultas separa orçamento, recusa e a confirmar, e tira o e-mail devolvido da base", () => {
    const c = contarConsultas(
      [
        cons({ situacao: "orcamento" }),
        cons({ situacao: "recusa" }),
        cons({ situacao: "recusa" }),
        cons({ situacao: "a_confirmar" }),
        cons({ situacao: "sem_resposta" }),
        cons({ situacao: "email_invalido" }),
        cons({ situacao: "orcamento", dataEnvio: d("2026-01-01") }),
      ],
      J,
    );
    expect(c).toEqual({ consultadas: 5, orcamentos: 1, recusas: 2, duvidas: 0, aConfirmar: 1, invalidos: 1 });
  });

  it("percentualDaSituacao: recusas e orçamentos sobre as consultas válidas", () => {
    const base = [
      cons({ situacao: "orcamento" }),
      cons({ situacao: "recusa" }),
      cons({ situacao: "a_confirmar" }),
      cons({ situacao: "sem_resposta" }),
      cons({ situacao: "email_invalido" }),
    ];
    expect(percentualDaSituacao(base, J, "orcamento")).toEqual({ valor: 25, base: 4, excluidos: 1 });
    expect(percentualDaSituacao(base, J, "recusa")).toEqual({ valor: 25, base: 4, excluidos: 1 });
  });

  it("percentual abaixo de 10% mantém uma casa decimal; de 10% em diante é inteiro", () => {
    const mk = (n: number, total: number) => [
      ...Array.from({ length: n }, () => cons({ situacao: "recusa" })),
      ...Array.from({ length: total - n }, () => cons({ situacao: "sem_resposta" })),
    ];
    // 63/7500 = 0,84% — antes aparecia como "1%"
    expect(percentualDaSituacao(mk(63, 7500), J, "recusa").valor).toBe(0.8);
    expect(percentualDaSituacao(mk(9, 100), J, "recusa").valor).toBe(9);
    expect(percentualDaSituacao(mk(1, 3), J, "recusa").valor).toBe(33);
    expect(percentualDaSituacao(mk(0, 10), J, "recusa").valor).toBe(0);
  });

  it("tempo de resposta ignora 'a confirmar'", () => {
    const r = tempoRespostaDias(
      [cons({ situacao: "a_confirmar", dataResposta: d("2026-11-03") })],
      J,
    );
    expect(r.base).toBe(0);
  });

  it("consultasComoCotacoes leva o processo e tira o e-mail devolvido da taxa por processo", () => {
    const out = consultasComoCotacoes([
      cons({ situacao: "recusa", processo: P1 }),
      cons({ situacao: "orcamento", processo: P2 }),
      cons({ situacao: "email_invalido", processo: P2 }),
    ]);
    expect(out.map((c) => [c.status, c.processo.chave])).toEqual([
      ["negativa", "p:1"],
      ["positiva", "p:2"],
    ]);
    // P2 tem 1 consulta válida respondida + 1 devolvida: a devolução não derruba a taxa para 50%.
    expect(taxaRespostaPorProcesso(out, J).find((t) => t.chave === "p:2")?.taxa).toBe(100);
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

describe("período ano", () => {
  it("é reconhecido na URL", () => {
    expect(lerPeriodo("ano")).toBe("ano");
  });

  it("começa em 1º de janeiro, meia-noite em Brasília, e a janela anterior tem o mesmo tamanho", () => {
    const agora = new Date("2026-11-17T15:00:00.000Z");
    const { atual, anterior } = janelas("ano", agora);
    expect(atual.inicio.toISOString()).toBe("2026-01-01T03:00:00.000Z");
    expect(atual.fim).toEqual(agora);
    expect(anterior.fim).toEqual(atual.inicio);
    expect(atual.fim.getTime() - atual.inicio.getTime()).toBe(anterior.fim.getTime() - anterior.inicio.getTime());
  });

  it("à 1h de 1º de janeiro em UTC ainda é 31/12 em Brasília: o ano é o anterior", () => {
    const { atual } = janelas("ano", new Date("2026-01-01T02:00:00.000Z"));
    expect(atual.inicio.toISOString()).toBe("2025-01-01T03:00:00.000Z");
  });

  it("o título diz o ano, não 'últimos Ano'", () => {
    expect(tituloPeriodo("ano", new Date("2026-11-17T15:00:00.000Z"))).toBe("ano de 2026, desde 1º de janeiro");
    expect(tituloPeriodo("90d", new Date())).toBe("últimos 90 dias");
  });
});

describe("situação 'duvida' (M30.d)", () => {
  it("dúvida conta como resposta nas contas por processo (só 'a confirmar' não conta)", () => {
    const out = consultasComoCotacoes([
      cons({ situacao: "duvida", processo: P1 }),
      cons({ situacao: "a_confirmar", processo: P1 }),
    ]);
    expect(out.map((c) => c.status)).toEqual(["incompleta", "silenciosa"]);
    expect(taxaRespostaPorProcesso(out, J).find((t) => t.chave === "p:1")).toMatchObject({ enviadas: 2, respondidas: 1 });
  });
});

describe("dúvida nos indicadores (M30.d)", () => {
  it("contarConsultas e percentualDaSituacao contam a dúvida sobre as consultas válidas", () => {
    const base = [
      cons({ situacao: "duvida" }),
      cons({ situacao: "duvida" }),
      cons({ situacao: "orcamento" }),
      cons({ situacao: "a_confirmar" }),
      cons({ situacao: "email_invalido" }),
    ];
    expect(contarConsultas(base, J).duvidas).toBe(2);
    expect(percentualDaSituacao(base, J, "duvida")).toEqual({ valor: 50, base: 4, excluidos: 1 });
  });

  it("a dúvida entra no tempo de resposta (pediu esclarecimento = respondeu); 'a confirmar' continua fora", () => {
    const r = tempoRespostaDias(
      [
        cons({ situacao: "duvida", dataResposta: d("2026-11-03") }),
        cons({ situacao: "a_confirmar", dataResposta: d("2026-11-03") }),
      ],
      J,
    );
    expect(r.base).toBe(1);
  });
});
