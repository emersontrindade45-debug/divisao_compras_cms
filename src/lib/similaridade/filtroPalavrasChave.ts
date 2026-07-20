import type { CandidatoSimilaridade } from "@/lib/ia/types";
import { contemPalavra } from "./texto";

/**
 * O PNCP não tem filtro por categoria/material na API de publicação — a busca textual
 * encontra o edital, mas cada edital traz TODOS os seus itens (ex.: "material de
 * expediente" inteiro para uma busca por caneta). Sem este pré-filtro, a IA recebe
 * centenas de candidatos irrelevantes, o que desperdiça tokens e dilui o ranking.
 *
 * Usa lógica OR: o candidato passa se a sua descrição contiver QUALQUER um dos termos
 * fornecidos (palavra inteira). Isso evita rejeitar itens válidos que usam sinônimos
 * (ex.: "limpeza" vs "lavagem") enquanto ainda filtra ruído de outras categorias.
 */
export function filtrarPorPalavrasChave(
  candidatos: CandidatoSimilaridade[],
  palavrasChave: string[],
): CandidatoSimilaridade[] {
  const termos = palavrasChave.map((t) => t.trim()).filter(Boolean);
  if (termos.length === 0) return candidatos;

  return candidatos.filter((candidato) =>
    termos.some((termo) => contemPalavra(candidato.fonteDescricao, termo)),
  );
}
