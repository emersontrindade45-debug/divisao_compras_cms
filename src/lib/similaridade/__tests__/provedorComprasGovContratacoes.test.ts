import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `matchingCatalogoLocal.ts` (dependência transitiva) consulta `@/lib/db` —
// sem este mock a suíte dispararia uma query Prisma real.
vi.mock("@/lib/db", () => ({
  db: { itemCatalogoReferencia: { findMany: vi.fn().mockResolvedValue([]) } },
}));

import { buscarCandidatosComprasGovContratacoes } from "../provedorComprasGovContratacoes";
import * as matching from "../matchingCatalogoLocal";
import * as clienteContratacoes from "@/lib/integracoes/comprasGovContratacoes";
import type { ItemContratacaoCompraGov } from "@/lib/integracoes/comprasGovContratacoes";

function itemDe(over: Partial<ItemContratacaoCompraGov> = {}): ItemContratacaoCompraGov {
  return {
    codItemCatalogo: 331791,
    codigoClasse: 7510,
    descricaoItem: "CAPA ENCADERNAÇÃO, MATERIAL PVC, TIPO A3",
    unidade: "Unidade",
    valorUnitarioResultado: 1.0,
    quantidadeHomologada: 100,
    dataResultado: new Date("2026-02-20T00:00:00.000Z"),
    orgaoEntidadeCnpj: "12345678000199",
    nomeFornecedorVencedor: "VM COMERCIO DE PAPEL LTDA",
    fonteUrl: "https://pncp.gov.br/app/editais/12345678000199/2025/10",
    idContratacaoPNCP: "12345678000199-1-000010/2025",
    numeroItemPncp: 3,
    ano: "2025",
    numeroSequencial: "10",
    ...over,
  };
}

describe("buscarCandidatosComprasGovContratacoes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devolve [] sem chamar buscarItensContratacoesCompraGov quando o matching local não encontra nenhum código", async () => {
    vi.spyOn(matching, "encontrarCodigosCatalogoLocal").mockResolvedValue([]);
    const clienteSpy = vi.spyOn(clienteContratacoes, "buscarItensContratacoesCompraGov");

    const resultado = await buscarCandidatosComprasGovContratacoes("termo sem correspondencia");

    expect(resultado).toEqual([]);
    expect(clienteSpy).not.toHaveBeenCalled();
  });

  it("chama o cliente com o codItemCatalogo encontrado e uma janela de 730 dias", async () => {
    vi.spyOn(matching, "encontrarCodigosCatalogoLocal").mockResolvedValue([331791]);
    const clienteSpy = vi
      .spyOn(clienteContratacoes, "buscarItensContratacoesCompraGov")
      .mockResolvedValue([]);

    await buscarCandidatosComprasGovContratacoes("capa encadernacao");

    expect(clienteSpy).toHaveBeenCalledTimes(1);
    const [filtro, periodo] = clienteSpy.mock.calls[0]!;
    expect(filtro).toEqual({ codItemCatalogo: 331791 });

    const dias =
      (periodo.dataFinal.getTime() - periodo.dataInicial.getTime()) / (24 * 60 * 60 * 1000);
    expect(dias).toBeCloseTo(730, 0);
  });

  it("busca os códigos com concorrência limitada (não sequencial, não ilimitada)", async () => {
    const codigos = [1, 2, 3, 4, 5, 6];
    vi.spyOn(matching, "encontrarCodigosCatalogoLocal").mockResolvedValue(codigos);

    let emVoo = 0;
    let picoSimultaneo = 0;
    vi.spyOn(clienteContratacoes, "buscarItensContratacoesCompraGov").mockImplementation(
      async () => {
        emVoo++;
        picoSimultaneo = Math.max(picoSimultaneo, emVoo);
        await new Promise((resolve) => setTimeout(resolve, 5));
        emVoo--;
        return [];
      },
    );

    await buscarCandidatosComprasGovContratacoes("termo generico");

    expect(clienteContratacoes.buscarItensContratacoesCompraGov).toHaveBeenCalledTimes(
      codigos.length,
    );
    // Nem sequencial (pico > 1) nem ilimitado (pico <= limite do provedor).
    expect(picoSimultaneo).toBeGreaterThan(1);
    expect(picoSimultaneo).toBeLessThanOrEqual(3);
  });

  describe("tratamento de dispersão (docs/ApiPlan.md — R$ 0,26 e R$ 96,37 no mesmo código CATMAT)", () => {
    it("exclui item fora do intervalo aceitável em torno da mediana do grupo", async () => {
      vi.spyOn(matching, "encontrarCodigosCatalogoLocal").mockResolvedValue([331791]);
      vi.spyOn(clienteContratacoes, "buscarItensContratacoesCompraGov").mockResolvedValue([
        itemDe({ valorUnitarioResultado: 10, idContratacaoPNCP: "a" }),
        itemDe({ valorUnitarioResultado: 10, idContratacaoPNCP: "b" }),
        itemDe({ valorUnitarioResultado: 10, idContratacaoPNCP: "c" }),
        itemDe({ valorUnitarioResultado: 10, idContratacaoPNCP: "d" }),
        // Discrepante: muito acima do intervalo em torno da mediana (10 ± 30%).
        itemDe({ valorUnitarioResultado: 1000, idContratacaoPNCP: "e" }),
      ]);
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const resultado = await buscarCandidatosComprasGovContratacoes("capa encadernacao");

      expect(resultado).toHaveLength(4);
      expect(resultado.every((c) => c.valorUnitario === 10)).toBe(true);
      expect(resultado.some((c) => c.valorUnitario === 1000)).toBe(false);
    });
  });

  describe("mapeamento para CandidatoSimilaridade", () => {
    it("usa tipoCandidato 'contratacao_publica' e mapeia os campos conforme a convenção do provedor PNCP", async () => {
      vi.spyOn(matching, "encontrarCodigosCatalogoLocal").mockResolvedValue([331791]);
      vi.spyOn(clienteContratacoes, "buscarItensContratacoesCompraGov").mockResolvedValue([
        itemDe(),
      ]);

      const [candidato] = await buscarCandidatosComprasGovContratacoes("capa encadernacao");

      expect(candidato).toMatchObject({
        tipoCandidato: "contratacao_publica",
        fonteDescricao: "CAPA ENCADERNAÇÃO, MATERIAL PVC, TIPO A3",
        fonteOrgaoOuId: "12345678000199",
        fonteUrl: "https://pncp.gov.br/app/editais/12345678000199/2025/10",
        valorUnitario: 1.0,
        unidade: "Unidade",
        quantidade: 100,
      });
      expect(candidato?.dataReferencia).toEqual(new Date("2026-02-20T00:00:00.000Z"));
    });

    it("preenche identidadeContratacao quando numeroItemPncp não é null", async () => {
      vi.spyOn(matching, "encontrarCodigosCatalogoLocal").mockResolvedValue([331791]);
      vi.spyOn(clienteContratacoes, "buscarItensContratacoesCompraGov").mockResolvedValue([
        itemDe({ numeroItemPncp: 7, ano: "2025", numeroSequencial: "10" }),
      ]);

      const [candidato] = await buscarCandidatosComprasGovContratacoes("capa encadernacao");

      expect(candidato?.identidadeContratacao).toEqual({
        cnpjOrgao: "12345678000199",
        ano: "2025",
        numeroSequencial: "10",
        numeroItem: 7,
      });
    });

    it("omite identidadeContratacao quando numeroItemPncp é null", async () => {
      vi.spyOn(matching, "encontrarCodigosCatalogoLocal").mockResolvedValue([331791]);
      vi.spyOn(clienteContratacoes, "buscarItensContratacoesCompraGov").mockResolvedValue([
        itemDe({ numeroItemPncp: null }),
      ]);

      const [candidato] = await buscarCandidatosComprasGovContratacoes("capa encadernacao");

      expect(candidato?.identidadeContratacao).toBeUndefined();
    });
  });
});
