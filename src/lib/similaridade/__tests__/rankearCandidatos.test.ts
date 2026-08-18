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

function candidato(diasAtras: number, valor = 100, fonteDescricao = "Cadeira"): CandidatoSimilaridade {
  return {
    tipoCandidato: "contratacao_publica",
    fonteDescricao,
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
      [candidato(10), candidato(800)],
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
          scoreDescricao: 90,
          scoreEspecificacao: 85,
          scoreUnidadeQuantidade: 80,
          adaptado: false,
          justificativa: "Muito similar",
        },
      ]),
    };

    const resultado = await rankearCandidatos(itemTR, [candidato(10)], provedor);

    expect(resultado[0]!.scoreFinal).toBe(85.75);
  });

  it("ordena os resultados por score final decrescente", async () => {
    const provedor: ProvedorIA = {
      extrairEspecificacaoTR: vi.fn(),
      rankearSimilaridade: vi.fn().mockResolvedValue([
        {
          candidato: candidato(10, 100),
          scoreFinal: 0,
          scoreDescricao: 85,
          scoreEspecificacao: 85,
          scoreUnidadeQuantidade: 85,
          adaptado: false,
          justificativa: "Bom",
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
    expect(resultado[1]!.scoreFinal).toBe(85);
  });

  it("descarta candidato de categoria distinta mesmo quando a média ponderada passa do corte", async () => {
    // scoreDescricao 50 = categoria errada; espec neutra + unidade alta rendem
    // scoreFinal 76.5 (>= 70), mas a categoria errada não pode ser resgatada pela média.
    const provedor: ProvedorIA = {
      extrairEspecificacaoTR: vi.fn(),
      rankearSimilaridade: vi.fn().mockResolvedValue([
        {
          candidato: candidato(10),
          scoreFinal: 0,
          scoreDescricao: 50,
          scoreEspecificacao: 90,
          scoreUnidadeQuantidade: 100,
          adaptado: false,
          justificativa: "Categoria diferente, mas unidade compatível",
        },
      ]),
    };

    const resultado = await rankearCandidatos(itemTR, [candidato(10)], provedor);

    expect(resultado).toEqual([]);
  });

  it("envia à IA os candidatos ordenados por sobreposição lexical com o item", async () => {
    const irrelevante = candidato(10, 100, "Grampeador de mesa");
    const relevante = candidato(20, 200, "Cadeira giratória de escritório");
    const provedor: ProvedorIA = {
      extrairEspecificacaoTR: vi.fn(),
      rankearSimilaridade: vi.fn().mockResolvedValue([]),
    };

    await rankearCandidatos(itemTR, [irrelevante, relevante], provedor);

    expect(provedor.rankearSimilaridade).toHaveBeenCalledWith(itemTR, [relevante, irrelevante]);
  });

  it("descarta candidatos com score final abaixo do mínimo aceitável", async () => {
    const provedor: ProvedorIA = {
      extrairEspecificacaoTR: vi.fn(),
      rankearSimilaridade: vi.fn().mockResolvedValue([
        {
          candidato: candidato(10, 100),
          scoreFinal: 0,
          scoreDescricao: 0,
          scoreEspecificacao: 0,
          scoreUnidadeQuantidade: 10,
          adaptado: false,
          justificativa: "Sem relação com o item (ex.: livro didático para uma caneta).",
        },
        {
          candidato: candidato(20, 200),
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
      [candidato(10, 100), candidato(20, 200)],
      provedor,
    );

    expect(resultado).toHaveLength(1);
    expect(resultado[0]!.candidato.valorUnitario).toBe(200);
  });

  it("repassa a natureza do objeto ao filtro de recência (janela mais curta para bem_consumo)", async () => {
    const provedor: ProvedorIA = {
      extrairEspecificacaoTR: vi.fn(),
      rankearSimilaridade: vi.fn().mockResolvedValue([]),
    };

    // 400 dias: dentro do teto padrão de 730, mas fora dos 365 de bem_consumo —
    // o candidato é filtrado antes de chegar à IA (nem chama rankearSimilaridade).
    const resultado = await rankearCandidatos(itemTR, [candidato(400)], provedor, "bem_consumo");

    expect(resultado).toEqual([]);
    expect(provedor.rankearSimilaridade).not.toHaveBeenCalled();
  });
});
