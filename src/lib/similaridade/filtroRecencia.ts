import { validarValidadeFontes } from "@/lib/domain/in65Rules";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

type NaturezaObjeto = "bem_consumo" | "servico_continuo";

/**
 * Filtra candidatos pela janela de recência da IN 65/2021, diferenciada por
 * natureza do objeto (ver `in65Rules.ts`): 18 meses para serviço contínuo,
 * 12 meses para bem de consumo, 730 dias quando o item ainda não foi
 * classificado (`naturezaObjeto` ausente/null).
 */
export function filtrarPorRecencia(
  candidatos: CandidatoSimilaridade[],
  naturezaObjeto?: NaturezaObjeto | null,
): CandidatoSimilaridade[] {
  if (candidatos.length === 0) return [];

  const fontes = candidatos.map((c, idx) => ({
    fonteId: String(idx),
    tipo: "contratacao_publica" as const,
    dataReferencia: c.dataReferencia,
    naturezaObjeto,
  }));

  const { value } = validarValidadeFontes(fontes, new Date());
  const validos = new Set(value.filter((v) => v.valida).map((v) => v.fonteId));

  return candidatos.filter((_, idx) => validos.has(String(idx)));
}

/**
 * Verifica se um único candidato está dentro da janela de recência — usada na
 * adição manual via assistente, onde só um candidato por vez precisa da
 * checagem. Delega ao mesmo `validarValidadeFontes` de `filtrarPorRecencia`
 * para manter a regra da IN 65/2021 numa fonte só.
 */
export function candidatoEstaNoTempo(
  candidato: CandidatoSimilaridade,
  naturezaObjeto?: NaturezaObjeto | null,
): boolean {
  const { value } = validarValidadeFontes(
    [
      {
        fonteId: "0",
        tipo: "contratacao_publica",
        dataReferencia: candidato.dataReferencia,
        naturezaObjeto,
      },
    ],
    new Date(),
  );
  return value[0]?.valida ?? false;
}
