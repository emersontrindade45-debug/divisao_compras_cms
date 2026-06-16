import { validarValidadeFontes } from "@/lib/domain/in65Rules";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

export function filtrarPorRecencia(
  candidatos: CandidatoSimilaridade[],
): CandidatoSimilaridade[] {
  if (candidatos.length === 0) return [];

  const fontes = candidatos.map((c, idx) => ({
    fonteId: String(idx),
    tipo: "contratacao_publica" as const,
    dataReferencia: c.dataReferencia,
  }));

  const { value } = validarValidadeFontes(fontes, new Date());
  const validos = new Set(value.filter((v) => v.valida).map((v) => v.fonteId));

  return candidatos.filter((_, idx) => validos.has(String(idx)));
}
