import { validarValidadeFontes } from "@/lib/domain/in65Rules";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

/**
 * Filtra candidatos pela janela de recência.
 *
 * @param diasMaximos Dias máximos contados da data de hoje. Padrão 730 (2 anos,
 *   janela padrão para serviços contínuos conforme IN 65/2021).
 *   Use 365 para aquisições/consumo, onde contratos antigos representam menos
 *   fielmente o preço atual do mercado.
 */
export function filtrarPorRecencia(
  candidatos: CandidatoSimilaridade[],
  diasMaximos = 730,
): CandidatoSimilaridade[] {
  if (candidatos.length === 0) return [];

  if (diasMaximos === 730) {
    // Caminho padrão: delega ao domínio para manter a regra IN 65/2021 centralizada.
    const fontes = candidatos.map((c, idx) => ({
      fonteId: String(idx),
      tipo: "contratacao_publica" as const,
      dataReferencia: c.dataReferencia,
    }));
    const { value } = validarValidadeFontes(fontes, new Date());
    const validos = new Set(value.filter((v) => v.valida).map((v) => v.fonteId));
    return candidatos.filter((_, idx) => validos.has(String(idx)));
  }

  // Janela personalizada (ex.: 365 para consumo): calcula diretamente.
  const agora = new Date();
  const cutoff = new Date(agora.getTime() - diasMaximos * 24 * 60 * 60 * 1000);
  return candidatos.filter((c) => c.dataReferencia >= cutoff);
}

/** Verifica se um único candidato está dentro da janela de recência. */
export function candidatoEstaNoTempo(
  candidato: CandidatoSimilaridade,
  diasMaximos: number,
): boolean {
  const agora = new Date();
  const diffMs = agora.getTime() - candidato.dataReferencia.getTime();
  const diasDecorridos = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diasDecorridos <= diasMaximos;
}
