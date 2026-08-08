import { describe, it, expect } from "vitest";
import { avaliarQualificacao } from "../qualificacaoFornecedor";

describe("avaliarQualificacao", () => {
  it("marca 'cadastro_irregular' quando a situação cadastral não é ATIVA", () => {
    const resultado = avaliarQualificacao({ situacaoCadastral: "BAIXADA" });

    expect(resultado.value.status).toBe("cadastro_irregular");
    expect(resultado.value.alerta).toBe(true);
  });

  it("marca 'regular' quando a situação cadastral é ATIVA", () => {
    const resultado = avaliarQualificacao({ situacaoCadastral: "ATIVA" });

    expect(resultado.value.status).toBe("regular");
    expect(resultado.value.alerta).toBe(false);
    expect(resultado.valid).toBe(true);
  });

  it("marca 'nao_verificado' quando a situação cadastral não pôde ser obtida", () => {
    const resultado = avaliarQualificacao({ situacaoCadastral: null });

    expect(resultado.value.status).toBe("nao_verificado");
    expect(resultado.value.alerta).toBe(true);
  });

  it("distingue 'cadastro_irregular' de variações de caixa (case-insensitive)", () => {
    const resultado = avaliarQualificacao({ situacaoCadastral: "baixada" });

    expect(resultado.value.status).toBe("cadastro_irregular");
  });
});
