import { describe, it, expect } from "vitest";
import { filtrarPorRecencia, candidatoEstaNoTempo } from "../filtroRecencia";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

function candidato(diasAtras: number): CandidatoSimilaridade {
  const dataReferencia = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000);
  return {
    tipoCandidato: "contratacao_publica",
    fonteDescricao: "Contrato teste",
    fonteOrgaoOuId: "ORG-1",
    valorUnitario: 100,
    dataReferencia,
    unidade: "unidade",
    quantidade: 10,
  };
}

describe("filtrarPorRecencia", () => {
  it("mantém candidatos dentro de 730 dias", () => {
    const resultado = filtrarPorRecencia([candidato(100)]);
    expect(resultado).toHaveLength(1);
  });

  it("mantém candidatos entre 365 e 730 dias (janela ampliada para serviços)", () => {
    const resultado = filtrarPorRecencia([candidato(500)]);
    expect(resultado).toHaveLength(1);
  });

  it("exclui candidatos com mais de 730 dias", () => {
    const resultado = filtrarPorRecencia([candidato(800)]);
    expect(resultado).toHaveLength(0);
  });

  it("mantém exatamente no limite de 730 dias", () => {
    const resultado = filtrarPorRecencia([candidato(730)]);
    expect(resultado).toHaveLength(1);
  });

  describe("janela por natureza do objeto", () => {
    it("bem_consumo: exclui além de 365 dias, mesmo dentro dos 730 padrão", () => {
      const resultado = filtrarPorRecencia([candidato(400)], "bem_consumo");
      expect(resultado).toHaveLength(0);
    });

    it("bem_consumo: mantém no limite de 365 dias", () => {
      const resultado = filtrarPorRecencia([candidato(365)], "bem_consumo");
      expect(resultado).toHaveLength(1);
    });

    it("servico_continuo: mantém no limite de 548 dias e exclui em 549", () => {
      expect(filtrarPorRecencia([candidato(548)], "servico_continuo")).toHaveLength(1);
      expect(filtrarPorRecencia([candidato(549)], "servico_continuo")).toHaveLength(0);
    });

    it("sem natureza (undefined/null) continua usando o teto de 730 dias", () => {
      expect(filtrarPorRecencia([candidato(400)])).toHaveLength(1);
      expect(filtrarPorRecencia([candidato(400)], null)).toHaveLength(1);
    });
  });
});

describe("candidatoEstaNoTempo", () => {
  // Usado na adição manual via assistente (um candidato por vez) — mesma regra
  // de `filtrarPorRecencia`, delegada ao mesmo `validarValidadeFontes`.
  it("aprova candidato dentro da janela padrão de 730 dias sem natureza", () => {
    expect(candidatoEstaNoTempo(candidato(700))).toBe(true);
  });

  it("rejeita candidato além de 730 dias sem natureza", () => {
    expect(candidatoEstaNoTempo(candidato(800))).toBe(false);
  });

  it("rejeita bem_consumo além de 365 dias mesmo dentro dos 730 padrão", () => {
    expect(candidatoEstaNoTempo(candidato(400), "bem_consumo")).toBe(false);
    expect(candidatoEstaNoTempo(candidato(365), "bem_consumo")).toBe(true);
  });

  it("aprova servico_continuo até 548 dias e rejeita em 549", () => {
    expect(candidatoEstaNoTempo(candidato(548), "servico_continuo")).toBe(true);
    expect(candidatoEstaNoTempo(candidato(549), "servico_continuo")).toBe(false);
  });
});
