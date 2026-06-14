import { describe, it, expect } from "vitest";
import { calcularScore } from "../supplierScore";

function cotacao(envio: string, resposta?: string) {
  return {
    dataEnvio: new Date(envio),
    dataResposta: resposta ? new Date(resposta) : undefined,
  };
}

describe("calcularScore", () => {
  it("taxa 100% e velocidade 0 dias → score 100", () => {
    const result = calcularScore({
      totalCotacoes: 1,
      totalRespostas: 1,
      historicoRespostas: [cotacao("2026-06-01", "2026-06-01")],
    });
    expect(result.value.score).toBe(100);
    expect(result.valid).toBe(true);
  });

  it("taxa 0% → score 0", () => {
    const result = calcularScore({
      totalCotacoes: 5,
      totalRespostas: 0,
      historicoRespostas: [cotacao("2026-06-01")],
    });
    expect(result.value.score).toBe(0);
  });

  it("taxa 50%, velocidade 5 dias → score 50 (30 + 20)", () => {
    const result = calcularScore({
      totalCotacoes: 2,
      totalRespostas: 1,
      historicoRespostas: [
        cotacao("2026-06-01", "2026-06-06"), // 5 dias
        cotacao("2026-06-01"),
      ],
    });
    expect(result.value.score).toBe(50);
    expect(result.value.breakdown.pontosResposta).toBe(30);
    expect(result.value.breakdown.pontosVelocidade).toBe(20);
  });

  it("taxa 100%, velocidade 10 dias → score 60 (60 + 0)", () => {
    const result = calcularScore({
      totalCotacoes: 1,
      totalRespostas: 1,
      historicoRespostas: [cotacao("2026-06-01", "2026-06-11")],
    });
    expect(result.value.score).toBe(60);
    expect(result.value.breakdown.pontosVelocidade).toBe(0);
  });

  it("0 cotações → score 0, valid true", () => {
    const result = calcularScore({
      totalCotacoes: 0,
      totalRespostas: 0,
      historicoRespostas: [],
    });
    expect(result.value.score).toBe(0);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("velocidade > 10 dias → pontosVelocidade não fica negativo", () => {
    const result = calcularScore({
      totalCotacoes: 1,
      totalRespostas: 1,
      historicoRespostas: [cotacao("2026-06-01", "2026-07-01")], // 30 dias
    });
    expect(result.value.breakdown.pontosVelocidade).toBe(0);
    expect(result.value.score).toBeGreaterThanOrEqual(0);
  });
});
