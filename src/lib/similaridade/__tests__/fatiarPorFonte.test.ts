import { describe, expect, it } from "vitest";
import { fatiarCandidatosPorFonte } from "../fatiarPorFonte";

function item(tipo: string, id: string) {
  return { tipoCandidato: tipo, id };
}

describe("fatiarCandidatosPorFonte", () => {
  it("não corta quando a lista já cabe no teto", () => {
    const lista = [item("contratacao_publica", "p1"), item("painel_precos", "a1")];
    expect(fatiarCandidatosPorFonte(lista, 25)).toEqual(lista);
  });

  it("mistura PNCP e Painel em vez de ficar só com os 25 primeiros do PNCP", () => {
    const pncp = Array.from({ length: 40 }, (_, i) => item("contratacao_publica", `p${i}`));
    const painel = Array.from({ length: 10 }, (_, i) => item("painel_precos", `a${i}`));
    const cortados = fatiarCandidatosPorFonte([...pncp, ...painel], 25);

    expect(cortados).toHaveLength(25);
    expect(cortados.some((c) => c.tipoCandidato === "painel_precos")).toBe(true);
    expect(cortados.filter((c) => c.tipoCandidato === "painel_precos")).toHaveLength(10);
    // A mutação que prova a garantia: um slice(0, 25) na concatenação PNCP+Painel
    // deixaria 0 cards do Painel (CLAUDE.md §9.35).
    expect([...pncp, ...painel].slice(0, 25).some((c) => c.tipoCandidato === "painel_precos")).toBe(
      false,
    );
  });

  it("preserva a ordem relativa dentro de cada fonte", () => {
    const lista = [
      item("contratacao_publica", "p0"),
      item("contratacao_publica", "p1"),
      item("painel_precos", "a0"),
      item("contratacao_publica", "p2"),
      item("painel_precos", "a1"),
    ];
    const cortados = fatiarCandidatosPorFonte(lista, 4);
    expect(cortados.map((c) => c.id)).toEqual(["p0", "a0", "p1", "a1"]);
  });
});
