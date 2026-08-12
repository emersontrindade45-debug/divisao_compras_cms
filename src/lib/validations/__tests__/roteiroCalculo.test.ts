import { describe, expect, it } from "vitest";
import { lerRoteiro, roteiroCalculoSchema } from "../roteiroCalculo";

const ROTEIRO_VALIDO = {
  valorInicial: 6.89,
  rotuloInicial: "preço do m²",
  unidadeInicial: "m²",
  passos: [{ operacao: "multiplicacao", origem: "medida_tr" }],
};

describe("roteiroCalculoSchema", () => {
  it("aceita um roteiro válido", () => {
    expect(roteiroCalculoSchema.safeParse(ROTEIRO_VALIDO).success).toBe(true);
  });

  it("aceita roteiro sem passo nenhum", () => {
    expect(
      roteiroCalculoSchema.safeParse({ valorInicial: 10, passos: [] }).success,
    ).toBe(true);
  });

  it("rejeita valor inicial zerado, negativo ou não finito", () => {
    expect(roteiroCalculoSchema.safeParse({ valorInicial: 0, passos: [] }).success).toBe(false);
    expect(roteiroCalculoSchema.safeParse({ valorInicial: -5, passos: [] }).success).toBe(false);
    expect(
      roteiroCalculoSchema.safeParse({ valorInicial: Number.POSITIVE_INFINITY, passos: [] })
        .success,
    ).toBe(false);
  });

  it("rejeita operação fora das seis admitidas", () => {
    const res = roteiroCalculoSchema.safeParse({
      valorInicial: 10,
      passos: [{ operacao: "potencia", origem: "livre", valor: 2 }],
    });
    expect(res.success).toBe(false);
  });

  it("rejeita origem desconhecida", () => {
    const res = roteiroCalculoSchema.safeParse({
      valorInicial: 10,
      passos: [{ operacao: "multiplicacao", origem: "lua_cheia" }],
    });
    expect(res.success).toBe(false);
  });

  // Passo com origem digitada sem número passaria batido pela validação de tipo
  // (o campo é opcional) e só falharia mais tarde, na execução — tarde demais.
  it("rejeita passo de origem livre sem número", () => {
    const res = roteiroCalculoSchema.safeParse({
      valorInicial: 10,
      passos: [{ operacao: "multiplicacao", origem: "livre" }],
    });
    expect(res.success).toBe(false);
  });

  it("rejeita passo de percentual sem o percentual", () => {
    const res = roteiroCalculoSchema.safeParse({
      valorInicial: 10,
      passos: [{ operacao: "acrescimo_percentual", origem: "medida_tr" }],
    });
    expect(res.success).toBe(false);
  });

  it("aceita passo de origem do TR sem número (o valor vem do item)", () => {
    const res = roteiroCalculoSchema.safeParse({
      valorInicial: 10,
      passos: [{ operacao: "multiplicacao", origem: "quantidade_tr" }],
    });
    expect(res.success).toBe(true);
  });

  // Cadeia longa demais é sinal de conta que ninguém vai justificar numa cota.
  it("rejeita mais de 8 passos", () => {
    const passos = Array.from({ length: 9 }, () => ({
      operacao: "multiplicacao" as const,
      origem: "quantidade_tr" as const,
    }));
    expect(roteiroCalculoSchema.safeParse({ valorInicial: 10, passos }).success).toBe(false);
  });
});

describe("lerRoteiro", () => {
  it("converte JSON válido em RoteiroCalculo", () => {
    const roteiro = lerRoteiro(ROTEIRO_VALIDO);
    expect(roteiro).not.toBeNull();
    expect(roteiro!.valorInicial).toBe(6.89);
    expect(roteiro!.passos).toHaveLength(1);
  });

  it("devolve null para null/undefined, sem lançar", () => {
    expect(lerRoteiro(null)).toBeNull();
    expect(lerRoteiro(undefined)).toBeNull();
  });

  // A tela precisa continuar renderizando o candidato mesmo com um JSON que não
  // bate mais com o schema atual — nunca derrubar a página inteira por isso.
  it("devolve null para JSON que não bate com o schema, sem lançar", () => {
    expect(lerRoteiro({ passos: "não é array" })).toBeNull();
    expect(lerRoteiro("string solta")).toBeNull();
    expect(lerRoteiro(42)).toBeNull();
    expect(() => lerRoteiro({ lixo: true })).not.toThrow();
  });
});
