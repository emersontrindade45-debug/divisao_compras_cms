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
});
