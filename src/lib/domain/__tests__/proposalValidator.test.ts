import { describe, it, expect } from "vitest";
import { validarProposta } from "../proposalValidator";

const hoje = new Date("2026-06-14");

function datasAtras(dias: number): Date {
  const d = new Date(hoje);
  d.setDate(d.getDate() - dias);
  return d;
}

const propostaValida = {
  cnpj: "12.345.678/0001-90",
  descricaoObjeto: "Cadeiras ergonômicas NR-17",
  valorUnitario: 1200,
  valorTotal: 48000,
  dataEmissao: datasAtras(30),
  nomeResponsavel: "Maria Silva",
};

describe("validarProposta", () => {
  it("proposta completa e válida → statusGeral valida, sem violations block", () => {
    const result = validarProposta(propostaValida, hoje);
    expect(result.value.statusGeral).toBe("valida");
    expect(result.valid).toBe(true);
    expect(result.violations.filter((v) => v.severity === "block")).toHaveLength(0);
  });

  it("cnpj ausente → statusGeral invalida, violation block", () => {
    const result = validarProposta({ ...propostaValida, cnpj: undefined }, hoje);
    expect(result.value.statusGeral).toBe("invalida");
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.severity === "block")).toBe(true);
    expect(result.value.itens.find((i) => i.campo === "cnpj")?.status).toBe("invalido");
  });

  it("dataEmissao com 181 dias → statusGeral com_ressalva, violation warn OP-SLA-03", () => {
    const result = validarProposta({ ...propostaValida, dataEmissao: datasAtras(181) }, hoje);
    expect(result.value.statusGeral).toBe("com_ressalva");
    expect(result.valid).toBe(true);
    expect(result.violations.some((v) => v.code === "OP-SLA-03" && v.severity === "warn")).toBe(true);
    expect(result.value.itens.find((i) => i.campo === "dataEmissao")?.status).toBe("ressalva");
  });

  it("valorUnitario ausente + dataEmissao vencida → statusGeral invalida", () => {
    const result = validarProposta(
      { ...propostaValida, valorUnitario: undefined, dataEmissao: datasAtras(200) },
      hoje,
    );
    expect(result.value.statusGeral).toBe("invalida");
    expect(result.valid).toBe(false);
  });

  it("todos os campos ausentes → todos invalidos", () => {
    const result = validarProposta({}, hoje);
    expect(result.value.statusGeral).toBe("invalida");
    expect(result.value.itens.every((i) => i.status === "invalido")).toBe(true);
  });
});
