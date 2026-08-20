import { describe, expect, it } from "vitest";
import { normalizarMunicipio, normalizarTexto } from "../normalizarMunicipio";

describe("normalizarTexto", () => {
  it("remove acento, aparas espaço e converte para maiúsculas", () => {
    expect(normalizarTexto("  São Vicente  ")).toBe("SAO VICENTE");
  });
});

describe("normalizarMunicipio", () => {
  it("prefere a grafia canônica quando a cidade é da Baixada Santista", () => {
    expect(normalizarMunicipio("SAO VICENTE")).toBe("São Vicente");
    expect(normalizarMunicipio("santos")).toBe("Santos");
  });

  it("aplica título-caso quando a cidade não é conhecida", () => {
    expect(normalizarMunicipio("SAO PAULO")).toBe("Sao Paulo");
  });

  it("preposições curtas (2 letras) ficam em minúscula no título-caso", () => {
    expect(normalizarMunicipio("RIO DE JANEIRO")).toBe("Rio de Janeiro");
  });

  // Regressão: /fornecedores/descobrir buscando "São Paulo" (grafia natural, com acento) não
  // achava nenhum dos candidatos importados, cujo `municipio` no banco é "Sao Paulo" (sem
  // acento — veio do CSV da Receita via este mesmo normalizador). O fallback de título-caso
  // preservava o acento da ENTRADA em vez de operar sobre o texto já normalizado
  // (sem acento) — só não aparecia no teste acima porque a entrada de exemplo ("SAO PAULO")
  // já não tinha acento nenhum para preservar.
  it("remove acento também no fallback de título-caso (cidade fora da Baixada Santista)", () => {
    expect(normalizarMunicipio("São Paulo")).toBe("Sao Paulo");
    expect(normalizarMunicipio("SÃO PAULO")).toBe("Sao Paulo");
    expect(normalizarMunicipio("Ribeirão Preto")).toBe("Ribeirao Preto");
  });

  it("é idempotente: normalizar duas vezes dá o mesmo resultado que normalizar uma", () => {
    const uma = normalizarMunicipio("São Paulo");
    expect(normalizarMunicipio(uma)).toBe(uma);
  });
});
