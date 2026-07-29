import { describe, it, expect } from "vitest";
import { filtrarPorRecencia } from "../filtroRecencia";
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
});
