export interface ModificadoresSelecao {
  /** Shift: seleciona o intervalo entre a última linha clicada e a atual. */
  shift: boolean;
  /** Ctrl/Cmd: alterna a linha sem limpar o resto da seleção. */
  ctrl: boolean;
}

export interface ResultadoSelecao {
  selecionados: Set<string>;
  /**
   * Nova âncora para o próximo Shift. Um clique com Shift NÃO move a âncora — é o que permite
   * ajustar o fim do intervalo com vários Shift+clique seguidos a partir do mesmo início, como
   * fazem o explorador de arquivos e as planilhas.
   */
  ancora: string | null;
}

/**
 * Regras de seleção de lista com Shift/Ctrl, no padrão que as pessoas já conhecem de gerenciador
 * de arquivos e planilha:
 *
 * - **Clique simples**: seleciona só aquela linha, descartando o resto.
 * - **Ctrl+clique**: alterna aquela linha, preservando as demais.
 * - **Shift+clique**: seleciona tudo entre a âncora e a linha clicada. Sem âncora (primeiro
 *   clique da lista), comporta-se como clique simples.
 *
 * O intervalo é calculado sobre `ordemVisivel` — a ordem em que as linhas estão NA TELA, não a
 * ordem de inserção nem a do banco. Se a lista for reordenada, "do item 3 até o 10" tem de
 * significar o que o usuário vê, senão o Shift seleciona um conjunto arbitrário.
 */
export function aplicarSelecao(
  selecionadosAtuais: Set<string>,
  ancoraAtual: string | null,
  idClicado: string,
  ordemVisivel: string[],
  modificadores: ModificadoresSelecao,
): ResultadoSelecao {
  const { shift, ctrl } = modificadores;

  if (shift && ancoraAtual !== null) {
    const inicio = ordemVisivel.indexOf(ancoraAtual);
    const fim = ordemVisivel.indexOf(idClicado);

    // Âncora ou alvo fora da lista visível (item filtrado depois do clique anterior): sem
    // intervalo definível, degrada para seleção simples em vez de devolver conjunto vazio.
    if (inicio === -1 || fim === -1) {
      return { selecionados: new Set([idClicado]), ancora: idClicado };
    }

    const [de, ate] = inicio <= fim ? [inicio, fim] : [fim, inicio];
    const intervalo = ordemVisivel.slice(de, ate + 1);

    // Ctrl+Shift soma o intervalo ao que já estava selecionado; Shift sozinho substitui.
    const base = ctrl ? new Set(selecionadosAtuais) : new Set<string>();
    for (const id of intervalo) base.add(id);

    return { selecionados: base, ancora: ancoraAtual };
  }

  if (ctrl) {
    const next = new Set(selecionadosAtuais);
    if (next.has(idClicado)) next.delete(idClicado);
    else next.add(idClicado);
    return { selecionados: next, ancora: idClicado };
  }

  // Clique simples numa linha já sozinha na seleção desmarca — senão não haveria como limpar a
  // seleção sem usar modificador.
  if (selecionadosAtuais.size === 1 && selecionadosAtuais.has(idClicado)) {
    return { selecionados: new Set(), ancora: null };
  }

  return { selecionados: new Set([idClicado]), ancora: idClicado };
}
