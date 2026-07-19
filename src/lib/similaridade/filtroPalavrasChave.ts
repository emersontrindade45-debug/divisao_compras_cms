import type { CandidatoSimilaridade } from "@/lib/ia/types";
import { contemPalavra } from "./texto";

/**
 * O PNCP não tem filtro por categoria/material na API de publicação — a busca textual
 * encontra o edital, mas cada edital traz TODOS os seus itens (ex.: "material de
 * expediente" inteiro para uma busca por caneta). Sem este pré-filtro, a IA recebe
 * centenas de candidatos irrelevantes, o que desperdiça tokens e dilui o ranking.
 *
 * O primeiro termo é a palavra-núcleo do item (o substantivo que o nomeia) e é
 * obrigatório, casado como palavra inteira — OR de termos com substring deixava passar
 * qualquer item que compartilhasse um qualificador genérico ("azul", "escolar").
 */
export function filtrarPorPalavrasChave(
  candidatos: CandidatoSimilaridade[],
  palavrasChave: string[],
): CandidatoSimilaridade[] {
  const nucleo = palavrasChave.find((t) => t.trim().length > 0);
  if (!nucleo) return candidatos;

  return candidatos.filter((candidato) => contemPalavra(candidato.fonteDescricao, nucleo));
}
