/**
 * Decide o que a sincronização da planilha faz com os itens do processo.
 *
 * A planilha é a fonte da DESCRIÇÃO, do PREÇO e da ORDEM dos itens; os candidatos de similaridade e
 * as fontes são trabalho do analista. O casamento é pela descrição normalizada, e o defeito que
 * este módulo corrige estava no que acontecia com o item que NÃO casa:
 *
 * - Antes: item cuja descrição mudou na planilha era APAGADO e recriado. O banco leva junto, em
 *   cascata, todos os candidatos já adicionados a ele, e o item novo nasce no fim da lista. Foi o
 *   que fez 6 preços sumirem no processo 05515/2026 (2026-11-17).
 * - Agora: item sem descrição correspondente só é apagado se NÃO tiver trabalho ligado a ele.
 *   Com trabalho, é RENOMEADO quando a linha da planilha na mesma posição (a ordem gravada na
 *   última sincronização) é uma descrição nova; sem par, é PRESERVADO e avisado.
 *
 * Domínio puro: não conhece Prisma nem a planilha, só descrições e ordem.
 */

export interface ItemExistente {
  id: string;
  descricao: string;
  /** Posição (1-based) gravada na última sincronização; null em item preservado ou sem ordem. */
  ordem: number | null;
  /** Tem candidato de similaridade (inclusive descartado) ou fonte ligados a ele. */
  temTrabalho: boolean;
}

export type AcaoItem =
  | { acao: "atualizar"; itemId: string; ordem: number }
  | { acao: "renomear"; itemId: string; ordem: number }
  | { acao: "criar"; ordem: number };

export interface PlanoItens {
  /** Uma entrada por linha da planilha, na mesma ordem dela. */
  itens: AcaoItem[];
  /** Itens sem trabalho ligado que saíram da planilha. */
  apagar: string[];
  /** Itens com trabalho ligado que saíram da planilha e não tiveram par: ficam, sem ordem. */
  preservar: string[];
}

/** Normaliza a descrição para casamento sem distinção de maiúsculas/acentos. */
export function normalizarDescricao(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function planejarItens(existentes: ItemExistente[], descricoesPlanilha: string[]): PlanoItens {
  const chavesPlanilha = descricoesPlanilha.map(normalizarDescricao);
  const setPlanilha = new Set(chavesPlanilha);

  // Como antes: com descrição repetida no banco, vale o último.
  const existentePorChave = new Map(existentes.map((e) => [normalizarDescricao(e.descricao), e.id]));

  const semPar = existentes.filter((e) => !setPlanilha.has(normalizarDescricao(e.descricao)));
  const novas = new Set<number>(); // índices da planilha sem item existente
  chavesPlanilha.forEach((chave, i) => {
    if (!existentePorChave.has(chave)) novas.add(i);
  });

  const apagar: string[] = [];
  const preservar: string[] = [];
  const renomear = new Map<number, string>(); // índice da planilha → id do item que ele renomeia

  for (const e of semPar) {
    if (!e.temTrabalho) {
      apagar.push(e.id);
      continue;
    }
    const indiceNaMesmaPosicao = e.ordem === null ? -1 : e.ordem - 1;
    if (novas.has(indiceNaMesmaPosicao)) {
      renomear.set(indiceNaMesmaPosicao, e.id);
      novas.delete(indiceNaMesmaPosicao);
    } else {
      preservar.push(e.id);
    }
  }

  const itens: AcaoItem[] = chavesPlanilha.map((chave, i) => {
    const ordem = i + 1;
    const renomeado = renomear.get(i);
    if (renomeado) return { acao: "renomear", itemId: renomeado, ordem };
    const existente = existentePorChave.get(chave);
    return existente ? { acao: "atualizar", itemId: existente, ordem } : { acao: "criar", ordem };
  });

  return { itens, apagar, preservar };
}
