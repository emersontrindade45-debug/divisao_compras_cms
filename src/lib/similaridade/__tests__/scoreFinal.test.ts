import { describe, it, expect } from "vitest";
import { calcularScoreFinal, PESOS_SIMILARIDADE } from "../scoreFinal";

describe("calcularScoreFinal", () => {
  it("aplica os pesos 40/35/25", () => {
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
    // 80*0.4 + 60*0.35 + 40*0.25 = 32 + 21 + 10 = 63
    expect(score).toBe(63);
  });

  it("expõe os pesos usados", () => {
    expect(PESOS_SIMILARIDADE).toEqual({
      descricao: 0.4,
      especificacao: 0.35,
      unidadeQuantidade: 0.25,
    });
  });
});
