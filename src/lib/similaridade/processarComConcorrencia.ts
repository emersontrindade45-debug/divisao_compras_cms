/**
 * Executa `tarefa` para cada item de `itens` com no máximo `limite` execuções
 * simultâneas. Falhas individuais não interrompem os demais itens — o
 * resultado na posição correspondente fica `undefined` e `onErro` é chamado.
 */
export async function processarComConcorrencia<T, R>(
  itens: T[],
  limite: number,
  tarefa: (item: T, indice: number) => Promise<R>,
  onErro?: (item: T, erro: unknown, indice: number) => void,
): Promise<(R | undefined)[]> {
  const resultados: (R | undefined)[] = new Array(itens.length);
  let proximoIndice = 0;

  async function worker() {
    while (proximoIndice < itens.length) {
      const indice = proximoIndice++;
      try {
        resultados[indice] = await tarefa(itens[indice], indice);
      } catch (erro) {
        onErro?.(itens[indice], erro, indice);
      }
    }
  }

  const workers = Array.from({ length: Math.min(limite, itens.length) }, () => worker());
  await Promise.all(workers);

  return resultados;
}
