/**
 * Notação A1 de coluna (0-based → letra). Extraído de `preencherPrecosPublicos`
 * para reuso na escrita de volta da planilha de fornecedores.
 *
 * 0 → A, 25 → Z, 26 → AA, 27 → AB.
 */
export function letraColuna(indice: number): string {
  if (!Number.isInteger(indice) || indice < 0) {
    throw new Error(`Índice de coluna inválido: ${indice}`);
  }
  let n = indice + 1;
  let letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

/** `'Aba'!A1:Z` — aspas no título são duplicadas (`O'Brien` → `'O''Brien'`). */
export function rangeAba(aba: string, a1: string): string {
  const tituloEscapado = aba.replace(/'/g, "''");
  return `'${tituloEscapado}'!${a1}`;
}

export function rangeA1(aba: string, coluna: number, linha1Based: number): string {
  return rangeAba(aba, `${letraColuna(coluna)}${linha1Based}`);
}
