import { describe, it, expect } from "vitest";
import {
  validarMinFornecedores,
  validarFontePublica,
  validarValidadeFontes,
  validarRegistroNaoRespondentes,
} from "../in65Rules";

describe("validarMinFornecedores", () => {
  it("válido com 3 ou mais fornecedores", () => {
    const result = validarMinFornecedores(3, false);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("block R-03 com 2 fornecedores sem justificativa", () => {
    const result = validarMinFornecedores(2, false);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "R-03" && v.severity === "block")).toBe(true);
  });

  it("warn OP-EXC-01 com 2 fornecedores com justificativa", () => {
    const result = validarMinFornecedores(2, true);
    expect(result.valid).toBe(true); // warn não bloqueia
    expect(result.violations.some((v) => v.code === "OP-EXC-01" && v.severity === "warn")).toBe(true);
  });

  it("block R-03 com 0 fornecedores mesmo com justificativa", () => {
    const result = validarMinFornecedores(0, true);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "R-03" && v.severity === "block")).toBe(true);
  });
});

describe("validarFontePublica", () => {
  it("válido quando usou fonte pública", () => {
    const result = validarFontePublica(true);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("block R-07 quando não usou e sem justificativa", () => {
    const result = validarFontePublica(false);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "R-07" && v.severity === "block")).toBe(true);
  });

  it("warn OP-EXC-02 quando não usou mas tem justificativa", () => {
    const result = validarFontePublica(false, "Nenhuma contratação pública similar encontrada");
    expect(result.valid).toBe(true);
    expect(result.violations.some((v) => v.code === "OP-EXC-02" && v.severity === "warn")).toBe(true);
  });
});

describe("validarValidadeFontes", () => {
  const hoje = new Date("2026-06-14");

  function datasAtras(dias: number): Date {
    const d = new Date(hoje);
    d.setDate(d.getDate() - dias);
    return d;
  }

  it("block OP-SLA-06 para contratação pública com 366 dias", () => {
    const result = validarValidadeFontes(
      [{ fonteId: "f1", tipo: "contratacao_publica", dataReferencia: datasAtras(366) }],
      hoje,
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "OP-SLA-06")).toBe(true);
  });

  it("válida para contratação pública com 364 dias", () => {
    const result = validarValidadeFontes(
      [{ fonteId: "f1", tipo: "contratacao_publica", dataReferencia: datasAtras(364) }],
      hoje,
    );
    expect(result.valid).toBe(true);
  });

  it("block OP-SLA-04 para site eletrônico com 91 dias", () => {
    const result = validarValidadeFontes(
      [{ fonteId: "f1", tipo: "site_eletronico", dataReferencia: datasAtras(91) }],
      hoje,
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "OP-SLA-04")).toBe(true);
  });

  it("block OP-SLA-03 para fornecedor direto com 181 dias", () => {
    const result = validarValidadeFontes(
      [{ fonteId: "f1", tipo: "fornecedor_direto", dataReferencia: datasAtras(181) }],
      hoje,
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "OP-SLA-03")).toBe(true);
  });
});

describe("validarRegistroNaoRespondentes", () => {
  it("warn R-04 quando há fornecedores sem resposta", () => {
    const result = validarRegistroNaoRespondentes(["f1", "f2", "f3"], ["f1"]);
    expect(result.violations.some((v) => v.code === "R-04" && v.severity === "warn")).toBe(true);
    expect(result.value.naoResponderam).toEqual(expect.arrayContaining(["f2", "f3"]));
  });

  it("sem violations quando todos responderam", () => {
    const result = validarRegistroNaoRespondentes(["f1", "f2"], ["f1", "f2"]);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
