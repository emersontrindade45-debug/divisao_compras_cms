import { describe, expect, it } from "vitest";
import { barrasDeCategoria, proporcaoEmPct } from "../formatosPainel";
import type { ResumoPeriodo } from "../painelDemanda";

const resumo = (remessas: number, taxa: number): ResumoPeriodo => ({
  remessas, processos: remessas, devolucoes: 0, processosDevolvidos: 0, taxaDevolucao: taxa,
  pctProcessosDevolvidos: 0, mediaPassagens: 1, maxPassagens: 1, intervaloMedianoDias: null,
});

describe("proporcaoEmPct", () => {
  it("é proporcional ao maior valor", () => expect(proporcaoEmPct(5, 10)).toBe(50));
  it("zero fica em zero e valor pequeno ainda aparece", () => {
    expect(proporcaoEmPct(0, 10)).toBe(0);
    expect(proporcaoEmPct(1, 1000)).toBe(2);
  });
  it("sem máximo ou com valor inválido não quebra", () => {
    expect(proporcaoEmPct(3, 0)).toBe(0);
    expect(proporcaoEmPct(NaN, 10)).toBe(0);
  });
  it("nunca passa de 100", () => expect(proporcaoEmPct(20, 10)).toBe(100));
});

describe("barrasDeCategoria", () => {
  const entrada = [
    { categoria: "bens", atual: resumo(100, 0.2), anterior: resumo(80, 0.1) },
    { categoria: "servicos", atual: resumo(10, 0.4), anterior: null },
    { categoria: "geral", atual: resumo(0, 0), anterior: null },
  ];
  it("omite categoria sem remessa no período", () => {
    expect(barrasDeCategoria(entrada).map((b) => b.categoria)).toEqual(["bens", "servicos"]);
  });
  it("marca amostra pequena abaixo de 20 remessas (e só abaixo)", () => {
    const b = barrasDeCategoria([...entrada, { categoria: "outros", atual: resumo(20, 0.1), anterior: null }]);
    expect(b.map((x) => x.amostraPequena)).toEqual([false, true, false]);
  });
  it("a maior taxa ocupa 100% e as outras são proporcionais", () => {
    const b = barrasDeCategoria(entrada);
    expect(b[1]!.larguraPct).toBe(100);
    expect(b[0]!.larguraPct).toBe(50);
  });
  it("traz a taxa anterior só quando havia remessa", () => {
    const b = barrasDeCategoria(entrada);
    expect(b[0]!.taxaAnterior).toBe(0.1);
    expect(b[1]!.taxaAnterior).toBeNull();
  });
  it("ano anterior sem remessa não vira taxa 0% (seria comparar com um período que não existiu)", () => {
    const b = barrasDeCategoria([{ categoria: "bens", atual: resumo(50, 0.2), anterior: resumo(0, 0) }]);
    expect(b[0]!.taxaAnterior).toBeNull();
  });
  it("lista vazia dá lista vazia", () => expect(barrasDeCategoria([])).toEqual([]));
});
