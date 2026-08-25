import { describe, it, expect, vi, beforeEach } from "vitest";
import { rankearEmLotesParalelos } from "../rankearEmLotesParalelos";
import type { CandidatoSimilaridade, ItemExtraidoTR, ProvedorIA } from "@/lib/ia/types";

const itemTR: ItemExtraidoTR = {
  descricao: "Link dedicado de internet 900 Mbps",
  especificacaoTecnica: "Full duplex, SLA 99%",
  unidade: "unidade",
  quantidade: 12,
};

function candidato(fonteDescricao: string): CandidatoSimilaridade {
  return {
    tipoCandidato: "contratacao_publica",
    fonteDescricao,
    fonteOrgaoOuId: "Órgão Teste",
    fonteUrl: `https://pncp.gov.br/app/editais/${fonteDescricao}`,
    valorUnitario: 100,
    dataReferencia: new Date(),
    unidade: "MES",
    quantidade: 12,
  };
}

/** N candidatos nomeados c0..c(N-1), todos recentes. */
function candidatos(n: number): CandidatoSimilaridade[] {
  return Array.from({ length: n }, (_, i) => candidato(`c${i}`));
}

/**
 * Provedor que devolve nota alta o bastante para passar no corte, decrescente
 * com a posição global, para a ordenação final ser observável.
 */
function provedorFake(
  overrides: Partial<ProvedorIA> = {},
): ProvedorIA & { chamadas: CandidatoSimilaridade[][] } {
  const chamadas: CandidatoSimilaridade[][] = [];
  const provedor = {
    chamadas,
    rankearSimilaridade: vi.fn(async (_item, lote: CandidatoSimilaridade[]) => {
      chamadas.push(lote);
      return lote.map((c) => ({
        candidato: c,
        scoreFinal: 0,
        scoreDescricao: 90,
        scoreEspecificacao: 90,
        scoreUnidadeQuantidade: 90,
        adaptado: false,
        justificativa: `avaliação de ${c.fonteDescricao}`,
      }));
    }),
    ...overrides,
  } as unknown as ProvedorIA & { chamadas: CandidatoSimilaridade[][] };
  return provedor;
}

describe("rankearEmLotesParalelos", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("divide em lotes de 8 em vez de mandar tudo numa chamada só", async () => {
    // 25 candidatos numa chamada única estouram o timeout de 20s do cliente
    // OpenAI (medido). A divisão é o que torna o ranqueamento viável no turno.
    const provedor = provedorFake();

    await rankearEmLotesParalelos(itemTR, candidatos(25), provedor);

    expect(provedor.chamadas.map((l) => l.length)).toEqual([8, 8, 8, 1]);
  });

  it("dispara os lotes em paralelo, não em sequência", async () => {
    let emVoo = 0;
    let maxSimultaneos = 0;
    const provedor = provedorFake({
      rankearSimilaridade: vi.fn(async (_item, lote: CandidatoSimilaridade[]) => {
        emVoo++;
        maxSimultaneos = Math.max(maxSimultaneos, emVoo);
        await new Promise((r) => setTimeout(r, 5));
        emVoo--;
        return lote.map((c) => ({
          candidato: c,
          scoreFinal: 0,
          scoreDescricao: 90,
          scoreEspecificacao: 90,
          scoreUnidadeQuantidade: 90,
          adaptado: false,
          justificativa: "",
        }));
      }),
    } as Partial<ProvedorIA>);

    await rankearEmLotesParalelos(itemTR, candidatos(24), provedor);

    // Sequencial daria 1; o ganho de 25s->10,5s medido depende disto.
    expect(maxSimultaneos).toBe(3);
  });

  it("mantém os lotes que deram certo quando um falha", async () => {
    let chamada = 0;
    const provedor = provedorFake({
      rankearSimilaridade: vi.fn(async (_item, lote: CandidatoSimilaridade[]) => {
        chamada++;
        if (chamada === 2) throw new Error("timeout do lote 2");
        return lote.map((c) => ({
          candidato: c,
          scoreFinal: 0,
          scoreDescricao: 90,
          scoreEspecificacao: 90,
          scoreUnidadeQuantidade: 90,
          adaptado: false,
          justificativa: "",
        }));
      }),
    } as Partial<ProvedorIA>);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const resultado = await rankearEmLotesParalelos(itemTR, candidatos(24), provedor);

    // 24 candidatos = 3 lotes de 8; um falhou, sobram 16.
    expect(resultado).toHaveLength(16);
  });

  it("devolve null quando TODOS os lotes falham, para não esvaziar a tela", async () => {
    // Distinção que importa: [] significa "nenhum candidato é relevante" e o
    // chamador esconde a lista; null significa "o ranqueamento não aconteceu" e
    // o chamador precisa cair para a ordem lexical em vez de mostrar nada.
    const provedor = provedorFake({
      rankearSimilaridade: vi.fn(async () => {
        throw new Error("API fora do ar");
      }),
    } as Partial<ProvedorIA>);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const resultado = await rankearEmLotesParalelos(itemTR, candidatos(10), provedor);

    expect(resultado).toBeNull();
  });

  it("ordena o resultado concatenado por score, cruzando a fronteira dos lotes", async () => {
    // O candidato com a melhor nota está no ÚLTIMO lote: sem a ordenação final
    // ele ficaria atrás de todo o primeiro lote só por causa do fatiamento.
    const provedor = provedorFake({
      rankearSimilaridade: vi.fn(async (_item, lote: CandidatoSimilaridade[]) =>
        lote.map((c) => ({
          candidato: c,
          scoreFinal: 0,
          scoreDescricao: c.fonteDescricao === "c9" ? 100 : 70,
          scoreEspecificacao: c.fonteDescricao === "c9" ? 100 : 70,
          scoreUnidadeQuantidade: c.fonteDescricao === "c9" ? 100 : 70,
          adaptado: false,
          justificativa: "",
        })),
      ),
    } as Partial<ProvedorIA>);

    const resultado = await rankearEmLotesParalelos(itemTR, candidatos(10), provedor);

    expect(resultado![0]!.candidato.fonteDescricao).toBe("c9");
  });

  it("devolve lista vazia sem chamar a IA quando não há candidatos", async () => {
    const provedor = provedorFake();

    const resultado = await rankearEmLotesParalelos(itemTR, [], provedor);

    expect(resultado).toEqual([]);
    expect(provedor.rankearSimilaridade).not.toHaveBeenCalled();
  });
});
