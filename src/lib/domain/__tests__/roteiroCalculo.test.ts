import { describe, expect, it } from "vitest";
import {
  calcularExecucoesNoPeriodo,
  classificarGrandeza,
  executarRoteiro,
  grandezasDivergentes,
  valorUnitarioEfetivo,
  type ParametrosTR,
  type RoteiroCalculo,
} from "../roteiroCalculo";

// Item real: fachada de 940 m², lavagem semestral, contrato pretendido de 24
// meses — logo 4 execuções no período.
const TR: ParametrosTR = {
  medida: 940,
  medidaUnidade: "m²",
  quantidade: 12,
  unidade: "unidade",
  frequencia: "semestral",
  vigenciaMeses: 24,
};

describe("calcularExecucoesNoPeriodo", () => {
  it("multiplica a frequência anual pela vigência pretendida", () => {
    expect(calcularExecucoesNoPeriodo("semestral", 24)).toBe(4);
    expect(calcularExecucoesNoPeriodo("mensal", 18)).toBe(18);
    expect(calcularExecucoesNoPeriodo("anual", 60)).toBe(5);
    expect(calcularExecucoesNoPeriodo("trimestral", 30)).toBe(10);
  });

  // Uma reforma pontual dentro de um contrato de 24 meses continua sendo uma.
  it("não multiplica execução única pela vigência", () => {
    expect(calcularExecucoesNoPeriodo("unica", 24)).toBe(1);
  });

  it("devolve null sem frequência ou sem vigência", () => {
    expect(calcularExecucoesNoPeriodo(null, 24)).toBeNull();
    expect(calcularExecucoesNoPeriodo("mensal", null)).toBeNull();
    expect(calcularExecucoesNoPeriodo("mensal", 0)).toBeNull();
  });
});

describe("executarRoteiro", () => {
  // Cenário 1 do usuário: contrato com valor global.
  it("resolve valor global ÷ medida do contrato × medida do TR × execuções", () => {
    const roteiro: RoteiroCalculo = {
      valorInicial: 75000,
      rotuloInicial: "valor global do contrato",
      unidadeInicial: null,
      passos: [
        { operacao: "divisao", origem: "quantidade_contrato", valor: 4500 },
        { operacao: "multiplicacao", origem: "medida_tr" },
        { operacao: "multiplicacao", origem: "execucoes_periodo" },
      ],
    };

    const res = executarRoteiro(roteiro, TR);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 75000/4500 = 16,6667 → ×940 = 15.666,67 → ×4 = 62.666,67
    expect(res.valorFinal).toBeCloseTo(62666.67, 2);
    expect(res.linhas).toHaveLength(3);
    expect(res.grandeza).toBe("escopo_tr_periodo");
  });

  // Cenário 2 do usuário: contrato já publica o preço do m².
  it("resolve preço unitário × medida do TR × execuções", () => {
    const roteiro: RoteiroCalculo = {
      valorInicial: 6.89,
      rotuloInicial: "preço do m² no contrato",
      unidadeInicial: "m²",
      passos: [
        { operacao: "multiplicacao", origem: "medida_tr" },
        { operacao: "multiplicacao", origem: "execucoes_periodo" },
      ],
    };

    const res = executarRoteiro(roteiro, TR);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 6,89 × 940 = 6.476,60 → × 4 = 25.906,40
    expect(res.linhas[0]!.acumulado).toBe(6476.6);
    expect(res.valorFinal).toBe(25906.4);
  });

  it("resolve bem de consumo: preço × quantidade do TR", () => {
    const res = executarRoteiro(
      {
        valorInicial: 12.5,
        passos: [{ operacao: "multiplicacao", origem: "quantidade_tr" }],
      },
      TR,
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.valorFinal).toBe(150);
    expect(res.grandeza).toBe("escopo_tr");
  });

  it("aceita roteiro sem passo nenhum (o preço do contrato já é o comparável)", () => {
    const res = executarRoteiro({ valorInicial: 12.5, passos: [] }, TR);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.valorFinal).toBe(12.5);
    expect(res.linhas).toHaveLength(0);
    expect(res.grandeza).toBe("unitario_contrato");
  });

  it("aplica percentual de acréscimo e de desconto", () => {
    const comBdi = executarRoteiro(
      {
        valorInicial: 1000,
        passos: [{ operacao: "acrescimo_percentual", origem: "livre", valor: 22, rotulo: "BDI" }],
      },
      TR,
    );
    expect(comBdi.ok && comBdi.valorFinal).toBe(1220);

    const comDesconto = executarRoteiro(
      {
        valorInicial: 1000,
        passos: [{ operacao: "desconto_percentual", origem: "livre", valor: 10 }],
      },
      TR,
    );
    expect(comDesconto.ok && comDesconto.valorFinal).toBe(900);
  });

  it("aplica subtração de valor fixo", () => {
    const res = executarRoteiro(
      {
        valorInicial: 1000,
        passos: [{ operacao: "subtracao", origem: "livre", valor: 150, rotulo: "frete destacado" }],
      },
      TR,
    );
    expect(res.ok && res.valorFinal).toBe(850);
  });

  // Arredondar a cada passo acumularia erro numa cadeia de 3 ou 4 etapas.
  it("arredonda para centavos só no resultado final", () => {
    const res = executarRoteiro(
      {
        valorInicial: 100,
        passos: [
          { operacao: "divisao", origem: "livre", valor: 3 },
          { operacao: "multiplicacao", origem: "livre", valor: 3 },
        ],
      },
      TR,
    );
    expect(res.ok && res.valorFinal).toBe(100);
  });

  describe("recusas", () => {
    // Devolver zero ou pular o passo produziria preço errado em silêncio.
    it("recusa passo que depende da medida do TR quando o item não tem medida", () => {
      const res = executarRoteiro(
        { valorInicial: 6.89, passos: [{ operacao: "multiplicacao", origem: "medida_tr" }] },
        { ...TR, medida: null },
      );

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.erro).toMatch(/medida do objeto no TR/i);
      expect(res.passoComProblema).toBe(0);
    });

    it("recusa passo de execuções quando falta frequência ou vigência", () => {
      const res = executarRoteiro(
        { valorInicial: 100, passos: [{ operacao: "multiplicacao", origem: "execucoes_periodo" }] },
        { ...TR, frequencia: null },
      );

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.erro).toMatch(/frequência e a vigência/i);
    });

    it("aponta qual passo falhou, não só que falhou", () => {
      const res = executarRoteiro(
        {
          valorInicial: 100,
          passos: [
            { operacao: "multiplicacao", origem: "quantidade_tr" },
            { operacao: "divisao", origem: "livre", valor: 0 },
          ],
        },
        TR,
      );

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.passoComProblema).toBe(1);
    });

    it("recusa passo digitado sem número", () => {
      const res = executarRoteiro(
        { valorInicial: 100, passos: [{ operacao: "multiplicacao", origem: "livre", valor: null }] },
        TR,
      );
      expect(res.ok).toBe(false);
    });

    it("recusa valor de partida zerado ou negativo", () => {
      expect(executarRoteiro({ valorInicial: 0, passos: [] }, TR).ok).toBe(false);
      expect(executarRoteiro({ valorInicial: -10, passos: [] }, TR).ok).toBe(false);
    });

    it("recusa resultado final zerado ou acima do limite gravável", () => {
      expect(
        executarRoteiro(
          {
            valorInicial: 1,
            passos: [{ operacao: "divisao", origem: "livre", valor: 1000 }],
          },
          TR,
        ).ok,
      ).toBe(false);
      expect(
        executarRoteiro(
          {
            valorInicial: 1_000_000_000,
            passos: [{ operacao: "multiplicacao", origem: "livre", valor: 1000 }],
          },
          TR,
        ).ok,
      ).toBe(false);
    });
  });

  // A memória de cálculo precisa dizer "pela medida do objeto no TR (940 m²)",
  // não "× 940" — é o que permite ao auditor refazer a conta.
  it("descreve cada passo pela origem do operando", () => {
    const res = executarRoteiro(
      {
        valorInicial: 6.89,
        passos: [
          { operacao: "multiplicacao", origem: "medida_tr" },
          { operacao: "multiplicacao", origem: "execucoes_periodo" },
        ],
      },
      TR,
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.linhas[0]!.descricao).toContain("medida do objeto no TR");
    expect(res.linhas[0]!.descricao).toContain("940");
    expect(res.linhas[1]!.descricao).toContain("execuções no período");
  });

  // Unidade ao lado do número: "por 4.500 m²" em vez de só "por 4.500" — é o
  // que o usuário pediu para deixar o texto claro sem precisar adivinhar.
  it("inclui a unidade do passo na descrição, quando informada", () => {
    const res = executarRoteiro(
      {
        valorInicial: 75000,
        passos: [
          { operacao: "divisao", origem: "quantidade_contrato", valor: 4500, unidade: "m²" },
          { operacao: "soma", origem: "livre", valor: 150, rotulo: "frete", unidade: "km" },
        ],
      },
      TR,
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.linhas[0]!.descricao).toContain("4.500 m²");
    expect(res.linhas[1]!.descricao).toContain("frete (150 km)");
  });

  it("não força unidade quando o passo não a informa", () => {
    const res = executarRoteiro(
      { valorInicial: 100, passos: [{ operacao: "divisao", origem: "livre", valor: 4 }] },
      TR,
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.linhas[0]!.descricao).toBe("por 4");
  });
});

describe("classificarGrandeza", () => {
  it("classifica pelo tipo de fator usado na cadeia", () => {
    expect(classificarGrandeza([])).toBe("unitario_contrato");
    expect(
      classificarGrandeza([{ operacao: "divisao", origem: "quantidade_contrato", valor: 10 }]),
    ).toBe("unitario_contrato");
    expect(classificarGrandeza([{ operacao: "multiplicacao", origem: "medida_tr" }])).toBe(
      "escopo_tr",
    );
    expect(
      classificarGrandeza([
        { operacao: "multiplicacao", origem: "medida_tr" },
        { operacao: "multiplicacao", origem: "execucoes_periodo" },
      ]),
    ).toBe("escopo_tr_periodo");
  });
});

describe("grandezasDivergentes", () => {
  // Mediana entre R$ 100,00/m² e R$ 25.906,40 pelo escopo não significa nada.
  it("acusa item com candidatos em grandezas diferentes", () => {
    expect(grandezasDivergentes(["unitario_contrato", "escopo_tr_periodo"])).toBe(true);
  });

  it("não acusa quando todos terminam na mesma grandeza", () => {
    expect(grandezasDivergentes(["escopo_tr_periodo", "escopo_tr_periodo"])).toBe(false);
  });

  // Candidato sem roteiro entra pelo valor cru da fonte, que é unitário.
  it("trata candidato sem roteiro como unitário", () => {
    expect(grandezasDivergentes([null, "unitario_contrato"])).toBe(false);
    expect(grandezasDivergentes([null, "escopo_tr"])).toBe(true);
  });
});

describe("valorUnitarioEfetivo", () => {
  it("usa o valor considerado quando existe", () => {
    expect(valorUnitarioEfetivo({ valorUnitario: 15000, valorConsiderado: 100 })).toBe(100);
  });

  it("cai no valor original da fonte quando não há roteiro", () => {
    expect(valorUnitarioEfetivo({ valorUnitario: 15000, valorConsiderado: null })).toBe(15000);
  });
});
