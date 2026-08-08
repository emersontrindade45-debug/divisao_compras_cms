import { describe, it, expect } from "vitest";
import { avaliarQualificacao } from "../qualificacaoFornecedor";

describe("avaliarQualificacao", () => {
  it("marca 'sancionado' quando há registro em CEIS ou CNEP", () => {
    const resultado = avaliarQualificacao({
      consultaSancoesNegada: false,
      sancoesEncontradas: [{ origem: "CEIS", tipoSancao: "Suspensão temporária" }],
      situacaoCadastral: "ATIVA",
    });

    expect(resultado.value.status).toBe("sancionado");
    expect(resultado.value.alerta).toBe(true);
    expect(resultado.valid).toBe(false);
    expect(resultado.violations.some((v) => v.severity === "block")).toBe(true);
  });

  it("marca 'cadastro_irregular' quando a situação cadastral não é ATIVA", () => {
    const resultado = avaliarQualificacao({
      consultaSancoesNegada: false,
      sancoesEncontradas: [],
      situacaoCadastral: "BAIXADA",
    });

    expect(resultado.value.status).toBe("cadastro_irregular");
    expect(resultado.value.alerta).toBe(true);
  });

  it("marca 'regular' quando não há sanção e a situação cadastral é ATIVA", () => {
    const resultado = avaliarQualificacao({
      consultaSancoesNegada: false,
      sancoesEncontradas: [],
      situacaoCadastral: "ATIVA",
    });

    expect(resultado.value.status).toBe("regular");
    expect(resultado.value.alerta).toBe(false);
    expect(resultado.valid).toBe(true);
  });

  it("marca 'nao_verificado' quando a consulta de sanções foi negada (token ausente) — NUNCA 'regular'", () => {
    const resultado = avaliarQualificacao({
      consultaSancoesNegada: true,
      motivoNegacaoSancoes: "PORTAL_TRANSPARENCIA_TOKEN não configurado",
      sancoesEncontradas: [],
      situacaoCadastral: "ATIVA",
    });

    expect(resultado.value.status).toBe("nao_verificado");
    expect(resultado.value.status).not.toBe("regular");
    expect(resultado.value.alerta).toBe(true);
  });

  it("marca 'nao_verificado' quando a situação cadastral não pôde ser obtida", () => {
    const resultado = avaliarQualificacao({
      consultaSancoesNegada: false,
      sancoesEncontradas: [],
      situacaoCadastral: null,
    });

    expect(resultado.value.status).toBe("nao_verificado");
    expect(resultado.value.alerta).toBe(true);
  });

  it("prioriza sanção sobre situação cadastral irregular", () => {
    const resultado = avaliarQualificacao({
      consultaSancoesNegada: false,
      sancoesEncontradas: [{ origem: "CNEP", tipoSancao: "Multa" }],
      situacaoCadastral: "BAIXADA",
    });

    expect(resultado.value.status).toBe("sancionado");
  });

  // Mutação inversa (CLAUDE.md §9.53/§9.39): a asserção "nunca vira regular sem
  // consulta" só é garantia se, ao inverter a condição, o teste correspondente
  // cair. Aqui a mutação é o próprio caso acima: se a prioridade "negada ⇒
  // nao_verificado" fosse removida do código (ex.: caindo direto no ramo
  // 'regular' quando sancoesEncontradas está vazio), o teste
  // "NUNCA 'regular'" falharia. Documentado explicitamente para o revisor.
});
