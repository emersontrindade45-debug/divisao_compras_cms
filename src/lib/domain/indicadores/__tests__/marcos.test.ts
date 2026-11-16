import { describe, expect, it } from "vitest";
import { marcosAtingidos } from "../marcos";

describe("marcosAtingidos", () => {
  it("sem preço incluído não atinge nenhum marco", () => {
    expect(marcosAtingidos({ totalIncluidos: 0, maiorSerieIncluidos: 0 })).toEqual({
      primeiraReferencia: false,
      serieMinima: false,
    });
  });

  it("um preço atinge só a primeira referência", () => {
    expect(marcosAtingidos({ totalIncluidos: 1, maiorSerieIncluidos: 1 })).toEqual({
      primeiraReferencia: true,
      serieMinima: false,
    });
  });

  it("três preços espalhados em itens diferentes NÃO são série mínima", () => {
    expect(marcosAtingidos({ totalIncluidos: 3, maiorSerieIncluidos: 1 }).serieMinima).toBe(false);
  });

  it("série mínima exige 3 preços no mesmo item (fronteira em 3)", () => {
    expect(marcosAtingidos({ totalIncluidos: 2, maiorSerieIncluidos: 2 }).serieMinima).toBe(false);
    expect(marcosAtingidos({ totalIncluidos: 3, maiorSerieIncluidos: 3 }).serieMinima).toBe(true);
  });
});
