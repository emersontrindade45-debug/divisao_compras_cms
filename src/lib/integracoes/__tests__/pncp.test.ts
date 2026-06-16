import { describe, it, expect, vi, afterEach } from "vitest";
import { buscarContratosPNCP } from "../pncp";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buscarContratosPNCP", () => {
  it("mapeia a resposta da API para CandidatoSimilaridade", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            numeroControlePNCP: "123",
            orgaoEntidade: { razaoSocial: "Prefeitura Teste" },
            objetoCompra: "Cadeira de escritório",
            valorUnitarioEstimado: 250.5,
            dataAtualizacao: "2026-01-10T00:00:00Z",
            unidadeMedida: "unidade",
            quantidade: 50,
          },
        ],
      }),
    } as Response);

    const resultado = await buscarContratosPNCP("cadeira de escritório");

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      tipoCandidato: "contratacao_publica",
      fonteDescricao: "Cadeira de escritório",
      fonteOrgaoOuId: "Prefeitura Teste",
      valorUnitario: 250.5,
      unidade: "unidade",
      quantidade: 50,
    });
  });

  it("retorna lista vazia quando a API falha", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 500 } as Response);
    const resultado = await buscarContratosPNCP("qualquer coisa");
    expect(resultado).toEqual([]);
  });
});
