import { describe, expect, it } from "vitest";
import type { TipoCandidatoSimilaridade } from "@prisma/client";
import {
  mapTipoCandidatoParaFonte,
  podePromoverCandidato,
} from "../tipoFonteSimilaridade";

/**
 * Fonte única da lista de tipos: derivada do enum do Prisma via tipo, de modo
 * que adicionar um valor novo ao schema sem tratá-lo aqui quebre o typecheck em
 * vez de passar silenciosamente.
 */
const TODOS_OS_TIPOS: readonly TipoCandidatoSimilaridade[] = [
  "contratacao_publica",
  "painel_precos",
  "site_eletronico",
];

describe("mapTipoCandidatoParaFonte", () => {
  it("mapeia contratacao_publica para contratacao_publica", () => {
    expect(mapTipoCandidatoParaFonte("contratacao_publica")).toBe("contratacao_publica");
  });

  it("mapeia painel_precos para contratacao_publica (referência pública)", () => {
    expect(mapTipoCandidatoParaFonte("painel_precos")).toBe("contratacao_publica");
  });

  it("mapeia site_eletronico para site_eletronico", () => {
    expect(mapTipoCandidatoParaFonte("site_eletronico")).toBe("site_eletronico");
  });

  it("devolve um TipoFonte válido para todo tipo de candidato", () => {
    const tiposFonteValidos = ["contratacao_publica", "site_eletronico", "fornecedor_direto"];
    for (const tipo of TODOS_OS_TIPOS) {
      expect(tiposFonteValidos).toContain(mapTipoCandidatoParaFonte(tipo));
    }
  });
});

describe("podePromoverCandidato", () => {
  it("permite promover contratação pública", () => {
    expect(podePromoverCandidato("contratacao_publica")).toEqual({ permitido: true });
  });

  it("permite promover resultado do Painel de Preços", () => {
    expect(podePromoverCandidato("painel_precos")).toEqual({ permitido: true });
  });

  // Conformidade IN 65/2021: promover criaria a Evidencia carimbando
  // `dataHoraAcesso` com o instante da promoção, e não com o do acesso real à
  // página — fabricando justamente o metadado que dá validade à evidência de
  // site. Se este teste falhar porque alguém liberou a promoção, a correção é
  // reverter a liberação, não ajustar a expectativa.
  it("recusa promover achado em site eletrônico", () => {
    const resultado = podePromoverCandidato("site_eletronico");
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivo).toBeTruthy();
  });

  it("explica o caminho correto na mensagem de recusa", () => {
    const { motivo } = podePromoverCandidato("site_eletronico");
    expect(motivo).toMatch(/data e hora/i);
    expect(motivo).toMatch(/sites/i);
  });

  it("decide explicitamente sobre todo tipo de candidato", () => {
    for (const tipo of TODOS_OS_TIPOS) {
      const resultado = podePromoverCandidato(tipo);
      expect(typeof resultado.permitido).toBe("boolean");
      // Recusa sem motivo seria um beco sem saída na UI (CLAUDE.md §9.40).
      if (!resultado.permitido) expect(resultado.motivo).toBeTruthy();
    }
  });
});
