import type { CandidatoSimilaridade } from "@/lib/ia/types";
import { normalizar } from "./texto";

/**
 * Chave de deduplicação de um candidato.
 *
 * Primária: `(cnpjOrgao, ano, numeroSequencial, numeroItem)` — identifica o
 * item de uma compra pública de forma exata, quando o provedor expõe a
 * identidade estruturada (`identidadeContratacao`; hoje só o PNCP a monta —
 * ver `buscarContratosPNCP`).
 *
 * Fallback: `(valorUnitario, dataReferencia, descricaoNormalizada)` — usado
 * quando o provedor não tem como saber o número do processo (ex.: o
 * Compras.gov, atrás de `painelPrecos.ts`, não expõe `orgao_cnpj`/sequencial
 * no payload de preços praticados). Menos preciso — dois candidatos
 * legitimamente distintos com mesmo preço, mesma data e descrição textual
 * igual colapsam em um — mas é a melhor aproximação disponível sem inventar
 * identidade que a fonte não fornece.
 */
function chaveDedup(candidato: CandidatoSimilaridade): string {
  const identidade = candidato.identidadeContratacao;
  if (identidade) {
    return [
      "contrato",
      identidade.cnpjOrgao,
      identidade.ano,
      identidade.numeroSequencial,
      identidade.numeroItem,
    ].join("|");
  }

  return [
    "fallback",
    candidato.valorUnitario,
    candidato.dataReferencia.toISOString().slice(0, 10),
    normalizar(candidato.fonteDescricao.trim()),
  ].join("|");
}

/**
 * Remove candidatos duplicados entre provedores do registry (docs/ApiPlan.md
 * §3.4): a mesma contratação pode chegar tanto pelo PNCP quanto por outra
 * fonte pública. Mantém a primeira ocorrência de cada chave — a ordem dos
 * provedores no registry decide qual cópia sobrevive.
 */
export function deduplicarCandidatos(
  candidatos: CandidatoSimilaridade[],
): CandidatoSimilaridade[] {
  const vistos = new Set<string>();
  const resultado: CandidatoSimilaridade[] = [];

  for (const candidato of candidatos) {
    const chave = chaveDedup(candidato);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push(candidato);
  }

  return resultado;
}
