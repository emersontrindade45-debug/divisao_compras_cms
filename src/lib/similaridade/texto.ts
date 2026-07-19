export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Quebra em palavras normalizadas (sem acento/caixa), descartando tokens de 1-2 letras. */
export function tokenizar(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 2);
}

// Plurais irregulares (ões/ãos/eis...) ficam de fora de propósito: errar para o lado
// de não casar só reduz recall do filtro lexical, nunca promove candidato errado.
export function raizPlural(palavra: string): string {
  return palavra.length > 3 && palavra.endsWith("s") ? palavra.slice(0, -1) : palavra;
}

/** true se `termo` aparece em `texto` como palavra inteira (tolerando plural simples). */
export function contemPalavra(texto: string, termo: string): boolean {
  const alvo = raizPlural(normalizar(termo).trim());
  if (!alvo) return false;
  return tokenizar(texto).some((palavra) => raizPlural(palavra) === alvo);
}
