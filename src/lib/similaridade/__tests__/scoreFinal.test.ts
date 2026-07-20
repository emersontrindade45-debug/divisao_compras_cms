import { describe, it, expect } from "vitest";
import { calcularScoreFinal, PESOS_SIMILARIDADE } from "../scoreFinal";

describe("calcularScoreFinal", () => {
  it("aplica os pesos 55/28/17", () => {
    const score = calcularScoreFinal({
      scoreDescricao: 100,
      scoreEspecificacao: 100,
      scoreUnidadeQuantidade: 100,
    });
    expect(score).toBe(100);
  });

  it("calcula corretamente com valores mistos", () => {
    const score = calcularScoreFinal({
      scoreDescricao: 80,
      scoreEspecificacao: 60,
      scoreUnidadeQuantidade: 40,
    });
    // 80*0.55 + 60*0.28 + 40*0.17 = 44 + 16.8 + 6.8 = 67.6
    expect(score).toBe(67.6);
  });

  it("expõe os pesos usados", () => {
    expect(PESOS_SIMILARIDADE).toEqual({
      descricao: 0.55,
      especificacao: 0.28,
      unidadeQuantidade: 0.17,
    });
  });
});
