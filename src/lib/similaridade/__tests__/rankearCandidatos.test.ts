import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rankearCandidatos } from "../rankearCandidatos";
import type { ProvedorIA, ItemExtraidoTR, CandidatoSimilaridade } from "@/lib/ia/types";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function candidato(diasAtras: number, valor = 100): CandidatoSimilaridade {
  return {
    tipoCandidato: "contratacao_publica",
    fonteDescricao: "Cadeira",
    fonteOrgaoOuId: "Org",
    valorUnitario: valor,
    dataReferencia: new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000),
    unidade: "unidade",
    quantidade: 10,
  };
}

const itemTR: ItemExtraidoTR = {
  descricao: "Cadeira de escritório",
  especificacaoTecnica: "Giratória, braços ajustáveis",
  unidade: "unidade",
  quantidade: 10,
};

describe("rankearCandidatos", () => {
  it("exclui candidatos fora da janela de recencia antes de chamar a IA", async () => {
    const provedor: ProvedorIA = {
      extrairEspecificacaoTR: vi.fn(),
      rankearSimilaridade: vi.fn().mockResolvedValue([
        {
          candidato: candidato(10),
          scoreFinal: 0,
          scoreDescricao: 90,
          scoreEspecificacao: 80,
          scoreUnidadeQuantidade: 100,
          adaptado: false,
          justificativa: "Muito similar",
        },
      ]),
    };

    const resultado = await rankearCandidatos(
      itemTR,
      [candidato(10), candidato(400)],
      provedor,
    );

    expect(provedor.rankearSimilaridade).toHaveBeenCalledWith(itemTR, [candidato(10)]);
    expect(resultado).toHaveLength(1);
  });

  it("calcula o score final com os pesos 40/35/25", async () => {
    const provedor: ProvedorIA = {
      extrairEspecificacaoTR: vi.fn(),
      rankearSimilaridade: vi.fn().mockResolvedValue([
        {
          candidato: candidato(10),
          scoreFinal: 0,
          scoreDescricao: 80,
          scoreEspecificacao: 60,
          scoreUnidadeQuantidade: 40,
          adaptado: false,
          justificativa: "Parcialmente similar",
        },
      ]),
    };

    const resultado = await rankearCandidatos(itemTR, [candidato(10)], provedor);

    expect(resultado[0]!.scoreFinal).toBe(63);
  });

  it("ordena os resultados por score final decrescente", async () => {
    const provedor: ProvedorIA = {
      extrairEspecificacaoTR: vi.fn(),
      rankearSimilaridade: vi.fn().mockResolvedValue([
        {
          candidato: candidato(10, 100),
          scoreFinal: 0,
          scoreDescricao: 50,
          scoreEspecificacao: 50,
          scoreUnidadeQuantidade: 50,
          adaptado: false,
          justificativa: "Médio",
        },
        {
          candidato: candidato(20, 200),
          scoreFinal: 0,
          scoreDescricao: 100,
          scoreEspecificacao: 100,
          scoreUnidadeQuantidade: 100,
          adaptado: false,
          justificativa: "Idêntico",
        },
      ]),
    };

    const resultado = await rankearCandidatos(
      itemTR,
      [candidato(10, 100), candidato(20, 200)],
      provedor,
    );

    expect(resultado[0]!.scoreFinal).toBe(100);
    expect(resultado[1]!.scoreFinal).toBe(50);
  });
});
