import "server-only";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

const PAINEL_PRECOS_BASE_URL = "https://api.paineldeprecos.economia.gov.br/v1/precos";

interface PainelPrecosResponse {
  id: string;
  orgao: string;
  descricaoItem: string;
  precoUnitario: number;
  dataCompra: string;
  unidadeFornecimento: string;
  quantidade: number;
}

export async function buscarPrecosPainelPrecos(termo: string): Promise<CandidatoSimilaridade[]> {
  try {
    const url = `${PAINEL_PRECOS_BASE_URL}?descricao=${encodeURIComponent(termo)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];

    const body = (await res.json()) as PainelPrecosResponse[];

    return body.map((p) => ({
      tipoCandidato: "painel_precos" as const,
      fonteDescricao: p.descricaoItem,
      fonteOrgaoOuId: p.orgao,
      fonteUrl: undefined,
      valorUnitario: p.precoUnitario,
      dataReferencia: new Date(p.dataCompra),
      unidade: p.unidadeFornecimento,
      quantidade: p.quantidade,
    }));
  } catch {
    return [];
  }
}
