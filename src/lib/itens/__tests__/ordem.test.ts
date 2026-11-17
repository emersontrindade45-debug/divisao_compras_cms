import { describe, expect, it } from "vitest";
import { numeroDoItem, rotuloDoItem } from "../ordem";

describe("numeroDoItem", () => {
  it("usa a ordem do TR quando existe", () => {
    expect(numeroDoItem(3, 7)).toBe(3);
  });
  it("sem ordem, cai na posição da lista", () => {
    expect(numeroDoItem(null, 7)).toBe(7);
  });
});

describe("rotuloDoItem", () => {
  it("prefixa o número do TR", () => {
    expect(rotuloDoItem(2, "Limpeza")).toBe("2. Limpeza");
  });
  it("sem número, devolve só a descrição (quem ainda não manda o número não muda de aparência)", () => {
    expect(rotuloDoItem(undefined, "Limpeza")).toBe("Limpeza");
  });
});
