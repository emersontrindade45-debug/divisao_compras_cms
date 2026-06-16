import { describe, it, expect, vi, afterEach } from "vitest";
import { buscarPrecosPainelPrecos } from "../painelPrecos";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buscarPrecosPainelPrecos", () => {
  it("mapeia a resposta da API para CandidatoSimilaridade", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ([
        {
          id: "abc",
          orgao: "Ministério Teste",
          descricaoItem: "Caneta esferográfica azul",
          precoUnitario: 1.2,
          dataCompra: "2026-02-01",
          unidadeFornecimento: "caixa",
          quantidade: 100,
        },
      ]),
    } as Response);

    const resultado = await buscarPrecosPainelPrecos("caneta esferográfica");

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      tipoCandidato: "painel_precos",
      fonteDescricao: "Caneta esferográfica azul",
      fonteOrgaoOuId: "Ministério Teste",
      valorUnitario: 1.2,
      unidade: "caixa",
      quantidade: 100,
    });
  });

  it("retorna lista vazia quando a API falha", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 500 } as Response);
    const resultado = await buscarPrecosPainelPrecos("qualquer coisa");
    expect(resultado).toEqual([]);
  });
});
