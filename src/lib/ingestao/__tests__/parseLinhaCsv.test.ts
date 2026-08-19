import { describe, expect, it } from "vitest";
import { parseLinhaCsv } from "../parseLinhaCsv";

describe("parseLinhaCsv", () => {
  it("divide campos simples separados por vírgula", () => {
    expect(parseLinhaCsv("12345678000199,EMPRESA LTDA,SP")).toEqual([
      "12345678000199",
      "EMPRESA LTDA",
      "SP",
    ]);
  });

  it("respeita campo entre aspas contendo vírgula", () => {
    expect(parseLinhaCsv('12345678000199,"EMPRESA, COMERCIO E SERVICOS LTDA",SP')).toEqual([
      "12345678000199",
      "EMPRESA, COMERCIO E SERVICOS LTDA",
      "SP",
    ]);
  });

  it("resolve aspas escapadas (dupla aspas) dentro de campo entre aspas", () => {
    expect(parseLinhaCsv('1,"EMPRESA ""APELIDO"" LTDA",SP')).toEqual([
      "1",
      'EMPRESA "APELIDO" LTDA',
      "SP",
    ]);
  });

  it("devolve campo vazio quando há vírgulas consecutivas", () => {
    expect(parseLinhaCsv("1,,SP")).toEqual(["1", "", "SP"]);
  });

  it("devolve null quando a linha termina com aspas não fechadas (quebra de linha embutida)", () => {
    expect(parseLinhaCsv('1,"EMPRESA SEM FECHAR,SP')).toBeNull();
  });

  it("linha vazia devolve um único campo vazio", () => {
    expect(parseLinhaCsv("")).toEqual([""]);
  });
});
