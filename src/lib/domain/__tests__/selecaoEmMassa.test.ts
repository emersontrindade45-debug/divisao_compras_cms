import { describe, expect, it } from "vitest";
import { aplicarSelecao } from "../selecaoEmMassa";

const ORDEM = ["a", "b", "c", "d", "e"];
const SEM = { shift: false, ctrl: false };
const SHIFT = { shift: true, ctrl: false };
const CTRL = { shift: false, ctrl: true };
const CTRL_SHIFT = { shift: true, ctrl: true };

const ids = (r: { selecionados: Set<string> }) => [...r.selecionados].sort();

describe("aplicarSelecao", () => {
  it("clique simples seleciona só a linha clicada", () => {
    const r = aplicarSelecao(new Set(["a", "b"]), "a", "d", ORDEM, SEM);

    expect(ids(r)).toEqual(["d"]);
    expect(r.ancora).toBe("d");
  });

  it("clique simples na única linha selecionada desmarca", () => {
    const r = aplicarSelecao(new Set(["c"]), "c", "c", ORDEM, SEM);

    expect(ids(r)).toEqual([]);
    expect(r.ancora).toBeNull();
  });

  it("Ctrl+clique acrescenta sem limpar o resto", () => {
    const r = aplicarSelecao(new Set(["a"]), "a", "d", ORDEM, CTRL);

    expect(ids(r)).toEqual(["a", "d"]);
  });

  it("Ctrl+clique numa linha já marcada desmarca só ela", () => {
    const r = aplicarSelecao(new Set(["a", "d"]), "a", "d", ORDEM, CTRL);

    expect(ids(r)).toEqual(["a"]);
  });

  it("Shift+clique seleciona o intervalo da âncora até a linha clicada", () => {
    const r = aplicarSelecao(new Set(["b"]), "b", "d", ORDEM, SHIFT);

    expect(ids(r)).toEqual(["b", "c", "d"]);
  });

  it("Shift funciona para trás (âncora depois do alvo)", () => {
    const r = aplicarSelecao(new Set(["d"]), "d", "b", ORDEM, SHIFT);

    expect(ids(r)).toEqual(["b", "c", "d"]);
  });

  it("Shift mantém a âncora, permitindo reajustar o fim do intervalo", () => {
    const primeiro = aplicarSelecao(new Set(["b"]), "b", "e", ORDEM, SHIFT);
    expect(ids(primeiro)).toEqual(["b", "c", "d", "e"]);
    expect(primeiro.ancora).toBe("b");

    // Segundo Shift a partir da MESMA âncora encolhe o intervalo em vez de somar.
    const segundo = aplicarSelecao(primeiro.selecionados, primeiro.ancora, "c", ORDEM, SHIFT);
    expect(ids(segundo)).toEqual(["b", "c"]);
  });

  it("Shift sem âncora se comporta como clique simples", () => {
    const r = aplicarSelecao(new Set(), null, "c", ORDEM, SHIFT);

    expect(ids(r)).toEqual(["c"]);
    expect(r.ancora).toBe("c");
  });

  it("Shift substitui a seleção anterior fora do intervalo", () => {
    const r = aplicarSelecao(new Set(["e"]), "b", "c", ORDEM, SHIFT);

    expect(ids(r)).toEqual(["b", "c"]);
  });

  it("Ctrl+Shift soma o intervalo ao que já estava selecionado", () => {
    const r = aplicarSelecao(new Set(["e"]), "b", "c", ORDEM, CTRL_SHIFT);

    expect(ids(r)).toEqual(["b", "c", "e"]);
  });

  it("usa a ordem VISÍVEL, não a ordem de inserção", () => {
    // Lista reordenada: o intervalo "b até d" segue o que está na tela.
    const reordenada = ["d", "c", "b", "a", "e"];
    const r = aplicarSelecao(new Set(["d"]), "d", "b", reordenada, SHIFT);

    expect(ids(r)).toEqual(["b", "c", "d"]);
  });

  it("degrada para seleção simples quando a âncora sumiu da lista", () => {
    const r = aplicarSelecao(new Set(["z"]), "z", "c", ORDEM, SHIFT);

    expect(ids(r)).toEqual(["c"]);
    expect(r.ancora).toBe("c");
  });

  it("não modifica o Set recebido", () => {
    const original = new Set(["a"]);
    aplicarSelecao(original, "a", "d", ORDEM, CTRL);

    expect([...original]).toEqual(["a"]);
  });
});
