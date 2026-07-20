import { describe, it, expect, vi, afterEach } from "vitest";
import { buscarCandidatosPublicos } from "../buscarCandidatosPublicos";
import * as pncp from "@/lib/integracoes/pncp";
import * as painelPrecos from "@/lib/integracoes/painelPrecos";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

afterEach(() => vi.restoreAllMocks());

describe("buscarCandidatosPublicos", () => {
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

    vi.spyOn(pncp, "buscarContratosPNCPMultiTermo").mockResolvedValue([candidatoPncp]);
    vi.spyOn(painelPrecos, "buscarPrecosPainelPrecos").mockResolvedValue([candidatoPainel]);

    const resultado = await buscarCandidatosPublicos("cadeira");

    expect(resultado).toEqual([candidatoPncp, candidatoPainel]);
  });

  it("aceita array de termos e passa todos para o PNCP", async () => {
    vi.spyOn(pncp, "buscarContratosPNCPMultiTermo").mockResolvedValue([]);
    vi.spyOn(painelPrecos, "buscarPrecosPainelPrecos").mockResolvedValue([]);

    await buscarCandidatosPublicos(["lavagem fachada", "limpeza fachada"]);

    expect(pncp.buscarContratosPNCPMultiTermo).toHaveBeenCalledWith([
      "lavagem fachada",
      "limpeza fachada",
    ]);
  });
});
