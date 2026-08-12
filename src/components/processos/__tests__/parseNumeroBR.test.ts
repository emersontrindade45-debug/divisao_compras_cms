import { describe, expect, it } from "vitest";
import { parseNumeroBR } from "../parseNumeroBR";

describe("parseNumeroBR", () => {
  it("lê inteiro simples", () => {
    expect(parseNumeroBR("150")).toBe(150);
  });

  it("lê decimal com vírgula (padrão pt-BR)", () => {
    expect(parseNumeroBR("997,50")).toBe(997.5);
  });

  it("lê valor com milhar e decimal", () => {
    expect(parseNumeroBR("15.000,00")).toBe(15000);
    expect(parseNumeroBR("1.234.567,89")).toBe(1234567.89);
  });

  // O caso perigoso: Number("15.000") devolve 15, e quinze mil reais viraria
  // quinze reais na série de preços sem nenhum aviso na tela.
  it("lê ponto como milhar quando os grupos são de 3 dígitos", () => {
    expect(parseNumeroBR("15.000")).toBe(15000);
    expect(parseNumeroBR("1.200.000")).toBe(1200000);
  });

  it("lê ponto como decimal quando não tem cara de milhar", () => {
    expect(parseNumeroBR("1.5")).toBe(1.5);
    expect(parseNumeroBR("997.36")).toBe(997.36);
    expect(parseNumeroBR("0.75")).toBe(0.75);
  });

  it("ignora símbolo de moeda e espaços", () => {
    expect(parseNumeroBR("R$ 15.000,00")).toBe(15000);
    expect(parseNumeroBR(" 940 ")).toBe(940);
  });

  it("aceita negativo (abatimento na operação de soma)", () => {
    expect(parseNumeroBR("-30,5")).toBe(-30.5);
  });

  it("devolve NaN para texto vazio ou não numérico", () => {
    expect(parseNumeroBR("")).toBeNaN();
    expect(parseNumeroBR("   ")).toBeNaN();
    expect(parseNumeroBR("abc")).toBeNaN();
    expect(parseNumeroBR("12abc")).toBeNaN();
  });
});
