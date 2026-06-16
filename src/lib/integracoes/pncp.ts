import "server-only";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

const PNCP_BASE_URL = "https://pncp.gov.br/api/consulta/v1/contratos";

interface PNCPContratoResponse {
  numeroControlePNCP: string;
  orgaoEntidade: { razaoSocial: string };
  objetoCompra: string;
  valorUnitarioEstimado: number;
  dataAtualizacao: string;
  unidadeMedida: string;
  quantidade: number;
}

export async function buscarContratosPNCP(termo: string): Promise<CandidatoSimilaridade[]> {
  try {
    const url = `${PNCP_BASE_URL}?objetoCompra=${encodeURIComponent(termo)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];

    const body = (await res.json()) as { data: PNCPContratoResponse[] };

    return (body.data ?? []).map((c) => ({
      tipoCandidato: "contratacao_publica" as const,
      fonteDescricao: c.objetoCompra,
      fonteOrgaoOuId: c.orgaoEntidade.razaoSocial,
      fonteUrl: `https://pncp.gov.br/app/contratos/${c.numeroControlePNCP}`,
      valorUnitario: c.valorUnitarioEstimado,
      dataReferencia: new Date(c.dataAtualizacao),
      unidade: c.unidadeMedida,
      quantidade: c.quantidade,
    }));
  } catch {
    return [];
  }
}
