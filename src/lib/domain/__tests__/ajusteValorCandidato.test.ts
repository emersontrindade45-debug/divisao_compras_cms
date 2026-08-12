import { describe, expect, it } from "vitest";
import {
  basesDivergentes,
  calcularValorConsiderado,
  calcularValorProjetadoTR,
  calcularValorUnitarioAjustado,
  valorUnitarioEfetivo,
} from "../ajusteValorCandidato";

describe("calcularValorUnitarioAjustado", () => {
  // O caso que motivou o módulo: contrato do MPPR publicado no PNCP como
  // "R$ 15.000,00 unitário" quando é o valor cheio por 150 m².
  it("divide o valor cheio do contrato pela quantidade contratada", () => {
    const res = calcularValorUnitarioAjustado({
      valorBase: 15000,
      operacao: "divisao",
      quantidade: 150,
    });

    expect(res).toEqual({ ok: true, valorUnitario: 100 });
  });

  it("multiplica quando a fonte publica preço por sub-unidade", () => {
    const res = calcularValorUnitarioAjustado({
      valorBase: 12.5,
      operacao: "multiplicacao",
      quantidade: 12,
    });

    expect(res).toEqual({ ok: true, valorUnitario: 150 });
  });

  it("soma quando há acréscimo fixo sobre o valor publicado", () => {
    const res = calcularValorUnitarioAjustado({
      valorBase: 100,
      operacao: "soma",
      quantidade: 25.5,
    });

    expect(res).toEqual({ ok: true, valorUnitario: 125.5 });
  });

  it("aceita quantidade negativa na soma (abatimento de valor fixo)", () => {
    const res = calcularValorUnitarioAjustado({
      valorBase: 100,
      operacao: "soma",
      quantidade: -30,
    });

    expect(res).toEqual({ ok: true, valorUnitario: 70 });
  });

  it("arredonda para centavos (Decimal(12,2) no banco)", () => {
    const res = calcularValorUnitarioAjustado({
      valorBase: 15000,
      operacao: "divisao",
      quantidade: 940,
    });

    // 15,957446... -> 15,96
    expect(res).toEqual({ ok: true, valorUnitario: 15.96 });
  });

  // Sem esta guarda o resultado seria Infinity e chegaria à série de preços.
  it("rejeita divisão por zero", () => {
    const res = calcularValorUnitarioAjustado({
      valorBase: 15000,
      operacao: "divisao",
      quantidade: 0,
    });

    expect(res.ok).toBe(false);
  });

  it("rejeita quantidade negativa em divisão e multiplicação", () => {
    expect(
      calcularValorUnitarioAjustado({ valorBase: 100, operacao: "divisao", quantidade: -2 }).ok,
    ).toBe(false);
    expect(
      calcularValorUnitarioAjustado({ valorBase: 100, operacao: "multiplicacao", quantidade: -2 })
        .ok,
    ).toBe(false);
  });

  it("rejeita valor base zerado ou negativo", () => {
    expect(
      calcularValorUnitarioAjustado({ valorBase: 0, operacao: "divisao", quantidade: 10 }).ok,
    ).toBe(false);
    expect(
      calcularValorUnitarioAjustado({ valorBase: -5, operacao: "divisao", quantidade: 10 }).ok,
    ).toBe(false);
  });

  it("rejeita operandos não numéricos", () => {
    expect(
      calcularValorUnitarioAjustado({ valorBase: Number.NaN, operacao: "divisao", quantidade: 10 })
        .ok,
    ).toBe(false);
    expect(
      calcularValorUnitarioAjustado({ valorBase: 100, operacao: "soma", quantidade: Number.NaN })
        .ok,
    ).toBe(false);
  });

  // Preço zerado passaria pela mediana sem sinal nenhum na tela.
  it("rejeita resultado que arredonda para zero", () => {
    const res = calcularValorUnitarioAjustado({
      valorBase: 1,
      operacao: "divisao",
      quantidade: 1000,
    });

    expect(res.ok).toBe(false);
  });

  it("rejeita resultado negativo vindo da soma", () => {
    const res = calcularValorUnitarioAjustado({
      valorBase: 100,
      operacao: "soma",
      quantidade: -100.5,
    });

    expect(res.ok).toBe(false);
  });

  it("rejeita resultado acima do que Decimal(12,2) grava", () => {
    const res = calcularValorUnitarioAjustado({
      valorBase: 1_000_000_000,
      operacao: "multiplicacao",
      quantidade: 1000,
    });

    expect(res.ok).toBe(false);
  });
});

describe("calcularValorProjetadoTR", () => {
  it("multiplica o unitário ajustado pela quantidade do TR", () => {
    expect(calcularValorProjetadoTR(100, 940)).toBe(94000);
  });

  it("arredonda para centavos", () => {
    expect(calcularValorProjetadoTR(15.96, 940)).toBe(15002.4);
  });

  it("devolve null sem quantidade de TR informada", () => {
    expect(calcularValorProjetadoTR(100, null)).toBeNull();
    expect(calcularValorProjetadoTR(100, undefined)).toBeNull();
  });

  it("devolve null para quantidade de TR inválida", () => {
    expect(calcularValorProjetadoTR(100, 0)).toBeNull();
    expect(calcularValorProjetadoTR(100, -5)).toBeNull();
    expect(calcularValorProjetadoTR(100, Number.NaN)).toBeNull();
  });
});

describe("valorUnitarioEfetivo", () => {
  it("usa o valor considerado quando existe", () => {
    expect(valorUnitarioEfetivo({ valorUnitario: 15000, valorConsiderado: 100 })).toBe(100);
  });

  it("cai no valor original da fonte quando não há ajuste", () => {
    expect(valorUnitarioEfetivo({ valorUnitario: 15000, valorConsiderado: null })).toBe(15000);
  });
});

describe("calcularValorConsiderado", () => {
  // O caso relatado em 2026-08-12: R$ 6,95 x 4500 m² = R$ 31.275,00, e o que
  // deve entrar na mediana é esse valor x 6 (quantidade do TR) = R$ 187.650,00.
  it("multiplica pela quantidade do TR quando a base é a projeção", () => {
    expect(
      calcularValorConsiderado({ valorUnitario: 31275, base: "projetado_tr", quantidadeTR: 6 }),
    ).toEqual({ ok: true, valor: 187650 });
  });

  it("devolve o próprio resultado do cálculo quando a base é unitária", () => {
    expect(
      calcularValorConsiderado({ valorUnitario: 100, base: "unitario", quantidadeTR: 940 }),
    ).toEqual({ ok: true, valor: 100 });
  });

  // Sem a quantidade do TR a projeção não tem resultado — gravar o unitário no
  // lugar dela seria mandar para a série um número que o analista não escolheu.
  it("recusa a projeção sem quantidade de TR", () => {
    const res = calcularValorConsiderado({
      valorUnitario: 31275,
      base: "projetado_tr",
      quantidadeTR: null,
    });

    expect(res.ok).toBe(false);
  });

  it("recusa projeção acima do limite gravável", () => {
    const res = calcularValorConsiderado({
      valorUnitario: 9_000_000_000,
      base: "projetado_tr",
      quantidadeTR: 100,
    });

    expect(res.ok).toBe(false);
  });
});

describe("basesDivergentes", () => {
  // Mediana entre R$ 100,00/m² e R$ 187.650,00 pelo escopo inteiro não
  // significa nada — a tela precisa avisar.
  it("acusa item com candidatos em bases diferentes", () => {
    expect(
      basesDivergentes([{ ajusteBaseSerie: "unitario" }, { ajusteBaseSerie: "projetado_tr" }]),
    ).toBe(true);
  });

  it("não acusa quando todos usam a mesma base", () => {
    expect(
      basesDivergentes([{ ajusteBaseSerie: "projetado_tr" }, { ajusteBaseSerie: "projetado_tr" }]),
    ).toBe(false);
  });

  // Candidato sem ajuste entra pelo valor cru da fonte, que é unitário — tratar
  // como `unitario` evita alarme falso no item que ninguém ajustou ainda.
  it("trata candidato sem ajuste como base unitária", () => {
    expect(basesDivergentes([{ ajusteBaseSerie: null }, { ajusteBaseSerie: "unitario" }])).toBe(
      false,
    );
    expect(basesDivergentes([{ ajusteBaseSerie: null }, { ajusteBaseSerie: "projetado_tr" }])).toBe(
      true,
    );
  });
});
