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

  it("block OP-SLA-06 para contratação pública com 731 dias (além dos 2 anos)", () => {
    const result = validarValidadeFontes(
      [{ fonteId: "f1", tipo: "contratacao_publica", dataReferencia: datasAtras(731) }],
      hoje,
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "OP-SLA-06")).toBe(true);
  });

  it("válida para contratação pública com 729 dias (dentro dos 2 anos)", () => {
    const result = validarValidadeFontes(
      [{ fonteId: "f1", tipo: "contratacao_publica", dataReferencia: datasAtras(729) }],
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

  describe("janela por natureza do objeto", () => {
    it("block para bem_consumo com 366 dias (além dos 12 meses)", () => {
      const result = validarValidadeFontes(
        [
          {
            fonteId: "f1",
            tipo: "contratacao_publica",
            dataReferencia: datasAtras(366),
            naturezaObjeto: "bem_consumo",
          },
        ],
        hoje,
      );
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.code === "OP-SLA-06")).toBe(true);
    });

    it("válida para bem_consumo com 365 dias (limite dos 12 meses)", () => {
      const result = validarValidadeFontes(
        [
          {
            fonteId: "f1",
            tipo: "contratacao_publica",
            dataReferencia: datasAtras(365),
            naturezaObjeto: "bem_consumo",
          },
        ],
        hoje,
      );
      expect(result.valid).toBe(true);
    });

    it("block para servico_continuo com 549 dias (além dos 18 meses)", () => {
      const result = validarValidadeFontes(
        [
          {
            fonteId: "f1",
            tipo: "contratacao_publica",
            dataReferencia: datasAtras(549),
            naturezaObjeto: "servico_continuo",
          },
        ],
        hoje,
      );
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.code === "OP-SLA-06")).toBe(true);
    });

    it("válida para servico_continuo com 548 dias (limite dos 18 meses)", () => {
      const result = validarValidadeFontes(
        [
          {
            fonteId: "f1",
            tipo: "contratacao_publica",
            dataReferencia: datasAtras(548),
            naturezaObjeto: "servico_continuo",
          },
        ],
        hoje,
      );
      expect(result.valid).toBe(true);
    });

    it("sem naturezaObjeto cai no teto de 730 dias (item não classificado)", () => {
      // Mesmo caso de fronteira do teste original (731/729), mas explicitando
      // que o fallback é o comportamento vigente antes desta mudança — a
      // classificação manual é o único jeito de encurtar a janela.
      const semNatureza = validarValidadeFontes(
        [{ fonteId: "f1", tipo: "contratacao_publica", dataReferencia: datasAtras(400) }],
        hoje,
      );
      expect(semNatureza.valid).toBe(true);

      const naturezaNula = validarValidadeFontes(
        [
          {
            fonteId: "f1",
            tipo: "contratacao_publica",
            dataReferencia: datasAtras(400),
            naturezaObjeto: null,
          },
        ],
        hoje,
      );
      expect(naturezaNula.valid).toBe(true);
    });
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
