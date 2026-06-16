import { describe, it, expect, vi } from "vitest";
import { buscarCandidatosPublicos } from "../buscarCandidatosPublicos";
import * as pncp from "@/lib/integracoes/pncp";
import * as painelPrecos from "@/lib/integracoes/painelPrecos";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

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

    vi.spyOn(pncp, "buscarContratosPNCP").mockResolvedValue([candidatoPncp]);
    vi.spyOn(painelPrecos, "buscarPrecosPainelPrecos").mockResolvedValue([candidatoPainel]);

    const resultado = await buscarCandidatosPublicos("cadeira");

    expect(resultado).toEqual([candidatoPncp, candidatoPainel]);
  });
});
