import type { CandidatoSimilaridade } from "@/lib/ia/types";
import { filtrarPorRecencia } from "./filtroRecencia";
import { tokenizar, raizPlural } from "./texto";

type NaturezaObjeto = "bem_consumo" | "servico_continuo";

/**
 * Ordena e filtra o conjunto devolvido pela busca do assistente, ANTES do corte
 * de `MAX_SUGESTOES_POR_BUSCA`.
 *
 * **Por que existe.** Até 2026-08-25 `buscar_pncp` fazia
 * `busca → filtro de valor → demoção → slice(0, 25)`, sem nenhum ranqueamento do
 * conjunto final. Os candidatos chegam agrupados por edital (até
 * `MAX_ITENS_RELEVANTES_POR_COMPRA` de cada), na ordem de relevância *de edital*
 * do PNCP — então a tela era preenchida pelos ~3 primeiros editais e um
 * candidato ótimo do 7º edital nunca aparecia. Medido pela régua
 * (`scripts/avaliar-busca-pncp.ts`) em 8 termos rotulados pelo analista:
 * 0% dos candidatos aprovados visíveis, 49% dos descartados visíveis, e a
 * posição 0 ocupada por um descarte em quase todo termo.
 *
 * O pipeline automático (`actions/pesquisaSimilaridade.ts`) já ranqueava; o
 * assistente rodava com estritamente menos inteligência que o lote. Esta função
 * reaproveita as mesmas peças puras, sem nenhuma requisição extra.
 *
 * **Ordem das etapas, e por que esta ordem:**
 *
 * 1. `filtrarPorRecencia` — candidato fora da janela da IN 65/2021 não pode
 *    virar preço, então ocupar vaga na tela é desperdiçar o clique do analista.
 *    Antes disto a recência só era checada na APROVAÇÃO
 *    (`candidatoEstaNoTempo` em `actions/assistente.ts`): o contrato vencido
 *    aparecia, o analista clicava, e só então era recusado.
 * 2. Ordenação por aderência lexical ao termo. É o corte de 25 que passa a ser
 *    por relevância em vez de por ordem de chegada.
 *
 * **Não filtra por aderência, só ordena.** `filtrarPorPalavrasChave` (usado no
 * pipeline automático) exige a palavra-núcleo e descartaria candidato legítimo
 * cuja descrição usa sinônimo — no assistente o analista está olhando a tela e
 * decide, então errar para o lado de mostrar é preferível. O que fica de fora
 * são apenas os candidatos que não casam com NADA do termo, e mesmo esses só
 * quando há material suficiente para preencher a tela sem eles (`minimoExibido`).
 */
export function ordenarResultadoBusca(
  candidatos: CandidatoSimilaridade[],
  termo: string,
  opcoes: { naturezaObjeto?: NaturezaObjeto | null; minimoExibido?: number } = {},
): CandidatoSimilaridade[] {
  if (candidatos.length === 0) return [];

  const noPrazo = filtrarPorRecencia(candidatos, opcoes.naturezaObjeto);
  // Recência que zera o resultado devolve o conjunto original: melhor o analista
  // ver candidatos vencidos (e ser barrado na aprovação, com a mensagem que
  // explica a janela) do que receber uma tela vazia sem saber por quê.
  const base = noPrazo.length > 0 ? noPrazo : candidatos;

  const tokensTermo = new Set(tokenizar(termo).map(raizPlural));
  if (tokensTermo.size === 0) return base;

  const aderencia = (candidato: CandidatoSimilaridade): number => {
    const tokens = new Set(tokenizar(candidato.fonteDescricao).map(raizPlural));
    let casados = 0;
    for (const token of tokensTermo) if (tokens.has(token)) casados++;
    return casados;
  };

  const pontuados = base
    .map((candidato, indice) => ({ candidato, indice, pontos: aderencia(candidato) }))
    // `sort` é estável por especificação desde a ES2019, mas o desempate por
    // índice é explícito aqui porque a ordem de chegada carrega significado: é
    // a relevância de edital do PNCP, o único sinal disponível entre candidatos
    // com a mesma aderência textual.
    .sort((a, b) => b.pontos - a.pontos || a.indice - b.indice);

  // Candidato que não casa nenhum token do termo é o ruído que enche a tela
  // hoje (switch e impressora numa busca por "link dedicado"). Ele sai — mas só
  // enquanto sobrar material aderente para preencher o corte, senão a busca
  // devolveria vazio para termo com vocabulário diferente do da fonte.
  const minimo = opcoes.minimoExibido ?? 0;
  const aderentes = pontuados.filter((p) => p.pontos > 0);
  const escolhidos = aderentes.length >= minimo ? aderentes : pontuados;

  return escolhidos.map((p) => p.candidato);
}
