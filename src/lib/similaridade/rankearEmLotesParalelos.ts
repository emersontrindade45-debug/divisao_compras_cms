import { rankearCandidatos } from "./rankearCandidatos";
import type {
  CandidatoSimilaridade,
  ItemExtraidoTR,
  ProvedorIA,
  ScoreSimilaridade,
} from "@/lib/ia/types";

/**
 * Tamanho de lote por chamada de IA. Medido contra a API real em 2026-08-25
 * (`scripts/medir-ranking-ia.ts`, gpt-4o-mini):
 *
 *   5 candidatos ->  8,1s        12 candidatos -> 15,3s
 *   8 candidatos ->  9,6s        25 candidatos -> ESTOUROU o timeout de 20s
 *
 * O custo é dominado pela GERAÇÃO de tokens de saída (um objeto de avaliação
 * por candidato), então cresce com o tamanho do lote e não se resolve com um
 * timeout maior — `MAX_CANDIDATOS_POR_CHAMADA` (30) em `rankearCandidatos` é
 * seguro para o limite de tokens, mas não para o relógio de uma rota com
 * `maxDuration = 60`.
 *
 * 8 é o joelho da curva: o maior lote que ainda fica confortavelmente abaixo do
 * timeout de 20s do cliente OpenAI, com folga para variação de latência.
 */
const TAMANHO_LOTE = 8;

/**
 * Ranqueia candidatos com IA em lotes pequenos e PARALELOS.
 *
 * **Por que paralelo e não um lote só.** Uma chamada com 25 candidatos estoura
 * o timeout de 20s do cliente; três chamadas de ~8 rodando juntas custam ~10,5s
 * na parede — o tempo da mais lenta, não a soma. Foi o que viabilizou usar o
 * ranqueador de IA dentro do `ORCAMENTO_TEMPO_TURNO_MS` (35s) do assistente,
 * junto de uma busca que já leva 10–22s.
 *
 * **Por que os lotes não se contaminam.** `rankearCandidatos` pontua cada
 * candidato contra o ITEM, não contra os outros candidatos do lote: o score de
 * um não depende de quem mais está no mesmo prompt. Por isso dividir o conjunto
 * não muda a nota de ninguém, e reordenar o resultado concatenado é legítimo.
 * (Se o prompt pontuasse por comparação relativa dentro do lote, esta função
 * seria incorreta — a divisão mudaria as notas.)
 *
 * **Isolamento de falha.** Um lote que falha (timeout, JSON inválido) não
 * derruba os outros: `allSettled` mantém o que deu certo, porque meia tela de
 * candidatos ranqueados é melhor que nenhuma. O chamador distingue "todos os
 * lotes falharam" (devolve `null`) de "nenhum candidato passou no corte"
 * (devolve `[]`) — são situações diferentes e pedem tratamento diferente.
 */
export async function rankearEmLotesParalelos(
  itemTR: ItemExtraidoTR,
  candidatos: CandidatoSimilaridade[],
  provedor: ProvedorIA,
  naturezaObjeto?: "bem_consumo" | "servico_continuo" | null,
): Promise<ScoreSimilaridade[] | null> {
  if (candidatos.length === 0) return [];

  const lotes: CandidatoSimilaridade[][] = [];
  for (let i = 0; i < candidatos.length; i += TAMANHO_LOTE) {
    lotes.push(candidatos.slice(i, i + TAMANHO_LOTE));
  }

  const resultados = await Promise.allSettled(
    lotes.map((lote) => rankearCandidatos(itemTR, lote, provedor, naturezaObjeto)),
  );

  const ranqueados: ScoreSimilaridade[] = [];
  let algumOk = false;
  resultados.forEach((resultado, indice) => {
    if (resultado.status === "fulfilled") {
      algumOk = true;
      ranqueados.push(...resultado.value);
      return;
    }
    console.error(
      `[rankearEmLotesParalelos] Lote ${indice + 1}/${lotes.length} falhou:`,
      resultado.reason,
    );
  });

  // Nenhum lote respondeu: o ranqueamento não aconteceu. Devolver [] aqui faria
  // o chamador concluir "nenhum candidato é relevante" e esvaziar a tela por uma
  // falha de infraestrutura — exatamente o oposto do que o analista precisa.
  if (!algumOk) return null;

  return ranqueados.sort((a, b) => b.scoreFinal - a.scoreFinal);
}
