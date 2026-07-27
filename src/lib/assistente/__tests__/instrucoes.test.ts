import { describe, it, expect } from "vitest";
import {
  chaveInstrucao,
  montarInstrucoesPesquisa,
  LIMITE_CARACTERES_INSTRUCAO,
  type InstrucaoCarregada,
} from "../instrucoes";

const GLOBAL: InstrucaoCarregada = {
  escopo: "global",
  conteudo: "Comece sempre pelo substantivo que nomeia o produto.",
};
const CATEGORIA: InstrucaoCarregada = {
  escopo: "categoria",
  categoria: "mobiliario",
  conteudo: "Ignore contratos de locação de móveis.",
};
const PROCESSO: InstrucaoCarregada = {
  escopo: "processo",
  conteudo: "Neste processo, desconsidere itens sem instalação inclusa.",
};

describe("chaveInstrucao", () => {
  it("usa 'global' para o escopo global", () => {
    expect(chaveInstrucao("global")).toBe("global");
  });

  it("normaliza a categoria para caixa baixa", () => {
    expect(chaveInstrucao("categoria", { categoria: " Mobiliario " })).toBe(
      "categoria:mobiliario",
    );
  });

  it("prefixa o id no escopo de processo", () => {
    expect(chaveInstrucao("processo", { processoId: "proc-1" })).toBe("processo:proc-1");
  });

  // Sem alvo, a chave colidiria com a global e a constraint @unique rejeitaria a
  // segunda gravação com um erro obscuro de banco. Falhar aqui é mais legível.
  it("exige categoria no escopo categoria", () => {
    expect(() => chaveInstrucao("categoria")).toThrow(/categoria/i);
  });

  it("exige processoId no escopo processo", () => {
    expect(() => chaveInstrucao("processo")).toThrow(/processoId/i);
  });

  it("gera chaves distintas para escopos diferentes", () => {
    const chaves = [
      chaveInstrucao("global"),
      chaveInstrucao("categoria", { categoria: "ti" }),
      chaveInstrucao("processo", { processoId: "p1" }),
    ];
    expect(new Set(chaves).size).toBe(3);
  });
});

describe("montarInstrucoesPesquisa", () => {
  it("não gera seção quando não há instruções", () => {
    expect(montarInstrucoesPesquisa([])).toBe("");
  });

  it("ignora instrução vazia ou só com espaços", () => {
    expect(montarInstrucoesPesquisa([{ escopo: "global", conteudo: "   " }])).toBe("");
  });

  it("ignora instrução desativada", () => {
    expect(montarInstrucoesPesquisa([{ ...GLOBAL, ativo: false }])).toBe("");
  });

  it("inclui o conteúdo das instruções ativas", () => {
    const texto = montarInstrucoesPesquisa([GLOBAL]);
    expect(texto).toContain("substantivo que nomeia o produto");
  });

  // A ordem é a regra de precedência: o mais específico por último, porque é
  // onde o modelo dá mais peso quando duas regras conflitam.
  it("ordena global → categoria → processo mesmo recebendo fora de ordem", () => {
    const texto = montarInstrucoesPesquisa([PROCESSO, CATEGORIA, GLOBAL]);

    const posGlobal = texto.indexOf("substantivo que nomeia");
    const posCategoria = texto.indexOf("locação de móveis");
    const posProcesso = texto.indexOf("sem instalação inclusa");

    expect(posGlobal).toBeGreaterThan(-1);
    expect(posGlobal).toBeLessThan(posCategoria);
    expect(posCategoria).toBeLessThan(posProcesso);
  });

  it("mostra o nome da categoria no rótulo", () => {
    expect(montarInstrucoesPesquisa([CATEGORIA])).toContain("(mobiliario)");
  });

  it("funciona com níveis faltando", () => {
    const texto = montarInstrucoesPesquisa([GLOBAL, PROCESSO]);
    expect(texto).toContain("substantivo que nomeia");
    expect(texto).toContain("sem instalação inclusa");
  });

  it("explicita a regra de precedência para o modelo", () => {
    expect(montarInstrucoesPesquisa([GLOBAL, CATEGORIA])).toMatch(/mais específica/i);
  });

  // Instruções entram no prompt de toda busca e todo ranking: texto sem teto
  // multiplicaria o custo por candidato avaliado.
  it("trunca conteúdo acima do limite de caracteres", () => {
    const gigante = "a".repeat(LIMITE_CARACTERES_INSTRUCAO + 500);
    const texto = montarInstrucoesPesquisa([{ escopo: "global", conteudo: gigante }]);

    const corpo = texto.slice(texto.indexOf("aaa"));
    expect(corpo.length).toBeLessThanOrEqual(LIMITE_CARACTERES_INSTRUCAO);
  });
});
