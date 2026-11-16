import { describe, expect, it } from "vitest";
import { MOTIVOS_CORRECAO, ehFalhaDocumental } from "../motivosCorrecao";

describe("motivos de correção", () => {
  it("os quatro primeiros contam como falha documental e os demais não", () => {
    expect(MOTIVOS_CORRECAO.filter(ehFalhaDocumental)).toEqual([
      "evidencia_ausente",
      "fonte_inadmissivel",
      "serie_insuficiente",
      "dispersao_sem_analise",
    ]);
  });
});
