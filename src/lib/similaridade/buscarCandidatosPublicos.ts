import { buscarContratosPNCP } from "@/lib/integracoes/pncp";
import { buscarPrecosPainelPrecos } from "@/lib/integracoes/painelPrecos";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

export async function buscarCandidatosPublicos(termo: string): Promise<CandidatoSimilaridade[]> {
  const [contratos, precos] = await Promise.all([
    buscarContratosPNCP(termo),
    buscarPrecosPainelPrecos(termo),
  ]);
  return [...contratos, ...precos];
}
