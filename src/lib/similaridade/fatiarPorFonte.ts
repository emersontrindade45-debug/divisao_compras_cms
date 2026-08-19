/**
 * Corta a lista de candidatos ao teto da tela **misturando as fontes**.
 *
 * `buscar_pncp` concatena os provedores na ordem do registry (PNCP primeiro) e
 * depois aplicava `slice(0, 25)`. O PNCP sozinho devolve dezenas de itens
 * homologados; o corte ficava inteiro com ele e o Painel de Preços — que tinha
 * respondido a tempo — sumia dos cards. Round-robin por `tipoCandidato`
 * preserva a ordem relativa dentro de cada fonte e garante que Painel e SINAPI
 * apareçam quando existem.
 */
export function fatiarCandidatosPorFonte<T extends { tipoCandidato: string }>(
  candidatos: T[],
  max: number,
): T[] {
  if (max <= 0) return [];
  if (candidatos.length <= max) return candidatos;

  const filas = new Map<string, T[]>();
  const ordem: string[] = [];
  for (const candidato of candidatos) {
    const tipo = candidato.tipoCandidato;
    let fila = filas.get(tipo);
    if (!fila) {
      fila = [];
      filas.set(tipo, fila);
      ordem.push(tipo);
    }
    fila.push(candidato);
  }

  const resultado: T[] = [];
  const indicePorTipo = new Map<string, number>(ordem.map((tipo) => [tipo, 0]));
  while (resultado.length < max) {
    let acrescentou = false;
    for (const tipo of ordem) {
      const fila = filas.get(tipo)!;
      const indice = indicePorTipo.get(tipo) ?? 0;
      if (indice >= fila.length) continue;
      resultado.push(fila[indice]!);
      indicePorTipo.set(tipo, indice + 1);
      acrescentou = true;
      if (resultado.length >= max) break;
    }
    if (!acrescentou) break;
  }
  return resultado;
}
