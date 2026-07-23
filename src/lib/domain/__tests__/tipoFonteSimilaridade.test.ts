import { describe, expect, it } from "vitest";
import { mapTipoCandidatoParaFonte } from "../tipoFonteSimilaridade";

describe("mapTipoCandidatoParaFonte", () => {
  it("mapeia contratacao_publica para contratacao_publica", () => {
    expect(mapTipoCandidatoParaFonte("contratacao_publica")).toBe("contratacao_publica");
  });

  it("mapeia painel_precos para contratacao_publica (referência pública)", () => {
    expect(mapTipoCandidatoParaFonte("painel_precos")).toBe("contratacao_publica");
  });

  it("cobre exatamente os 2 tipos de candidato de similaridade", () => {
    const tipos = ["contratacao_publica", "painel_precos"] as const;
    for (const tipo of tipos) {
      // Todo tipo mapeia para um TipoFonte válido (underscore, §9-6).
      expect(mapTipoCandidatoParaFonte(tipo)).toBe("contratacao_publica");
    }
  });
});
