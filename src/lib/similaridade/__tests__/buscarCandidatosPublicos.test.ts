import { afterEach, describe, it, expect, vi } from "vitest";
import { buscarCandidatosPublicos } from "../buscarCandidatosPublicos";
import * as pncp from "@/lib/integracoes/pncp";
import * as painelPrecos from "@/lib/integracoes/painelPrecos";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

describe("buscarCandidatosPublicos", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("combina resultados do PNCP e do Painel de Precos", async () => {
    const candidatoPncp: CandidatoSimilaridade = {
      tipoCandidato: "contratacao_publica",
      fonteDescricao: "Cadeira",
      fonteOrgaoOuId: "Org A",
      valorUnitario: 100,
      dataReferencia: new Date(),
      unidade: "unidade",
      quantidade: 10,
    };
    const candidatoPainel: CandidatoSimilaridade = {
      tipoCandidato: "painel_precos",
      fonteDescricao: "Cadeira",
      fonteOrgaoOuId: "Org B",
      valorUnitario: 110,
      dataReferencia: new Date(),
      unidade: "unidade",
      quantidade: 10,
    };

    vi.spyOn(pncp, "buscarContratosPNCP").mockResolvedValue([candidatoPncp]);
    vi.spyOn(painelPrecos, "buscarPrecosPainelPrecos").mockResolvedValue([candidatoPainel]);

    const resultado = await buscarCandidatosPublicos("cadeira");

    expect(resultado).toEqual([candidatoPncp, candidatoPainel]);
  });

  it("isola a falha de um provedor: os demais continuam disponíveis", async () => {
    const candidatoPainel: CandidatoSimilaridade = {
      tipoCandidato: "painel_precos",
      fonteDescricao: "Grampeador",
      fonteOrgaoOuId: "Org B",
      valorUnitario: 15,
      dataReferencia: new Date(),
      unidade: "unidade",
      quantidade: 3,
    };

    vi.spyOn(pncp, "buscarContratosPNCP").mockRejectedValue(new Error("PNCP fora do ar"));
    vi.spyOn(painelPrecos, "buscarPrecosPainelPrecos").mockResolvedValue([candidatoPainel]);
    const erroSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const resultado = await buscarCandidatosPublicos("grampeador");

    expect(resultado).toEqual([candidatoPainel]);
    expect(erroSpy).toHaveBeenCalled();
    erroSpy.mockRestore();
  });

  it("aplica timeout por provedor: um provedor que nunca resolve não trava a busca", async () => {
    vi.useFakeTimers();

    const candidatoPainel: CandidatoSimilaridade = {
      tipoCandidato: "painel_precos",
      fonteDescricao: "Mesa",
      fonteOrgaoOuId: "Org B",
      valorUnitario: 400,
      dataReferencia: new Date(),
      unidade: "unidade",
      quantidade: 1,
    };

    // Promessa que nunca resolve nem rejeita — simula provedor travado.
    vi.spyOn(pncp, "buscarContratosPNCP").mockReturnValue(new Promise(() => {}));
    vi.spyOn(painelPrecos, "buscarPrecosPainelPrecos").mockResolvedValue([candidatoPainel]);
    const erroSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const promessa = buscarCandidatosPublicos("mesa");
    // Avança além do timeout de qualquer provedor do registry sem esperar tempo real.
    await vi.advanceTimersByTimeAsync(60_000);
    const resultado = await promessa;

    expect(resultado).toEqual([candidatoPainel]);
    expect(erroSpy).toHaveBeenCalled();
    erroSpy.mockRestore();
  });

  it("deduplica candidatos que chegam de mais de um provedor para a mesma contratação", async () => {
    const dataReferencia = new Date("2026-01-10T00:00:00.000Z");
    const candidatoPncp: CandidatoSimilaridade = {
      tipoCandidato: "contratacao_publica",
      fonteDescricao: "Cadeira giratória",
      fonteOrgaoOuId: "Prefeitura de Exemplo",
      valorUnitario: 250,
      dataReferencia,
      unidade: "unidade",
      quantidade: 5,
    };
    // Mesmo preço, mesma data, mesma descrição (caixa/acento diferentes) — sem
    // identidade estruturada, deve colapsar no fallback de deduplicação.
    const candidatoPainelDuplicado: CandidatoSimilaridade = {
      tipoCandidato: "painel_precos",
      fonteDescricao: "CADEIRA GIRATORIA",
      fonteOrgaoOuId: "Outro órgão",
      valorUnitario: 250,
      dataReferencia,
      unidade: "unidade",
      quantidade: 5,
    };

    vi.spyOn(pncp, "buscarContratosPNCP").mockResolvedValue([candidatoPncp]);
    vi.spyOn(painelPrecos, "buscarPrecosPainelPrecos").mockResolvedValue([candidatoPainelDuplicado]);

    const resultado = await buscarCandidatosPublicos("cadeira giratoria");

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toEqual(candidatoPncp);
  });
});
