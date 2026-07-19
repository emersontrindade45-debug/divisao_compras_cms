const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "ou", "para", "com", "em", "a", "o",
  "as", "os", "um", "uma", "no", "na", "por", "que",
]);

/**
 * Extrai um termo de busca curto da descrição do item, para usar na busca
 * textual do PNCP. A descrição completa (frequentemente um parágrafo de
 * especificação técnica) não funciona bem como query de busca — usa-se só o
 * trecho inicial até a primeira pontuação, removendo stopwords.
 */
export function extrairTermoBusca(descricao: string, palavrasChave: string[] = []): string {
  if (palavrasChave.length > 0) {
    return palavrasChave.join(" ");
  }

  const trechoInicial = descricao.split(/[,.(]/)[0] ?? descricao;
  const palavras = trechoInicial
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2 && !STOPWORDS.has(p.toLowerCase()));

  return palavras.slice(0, 5).join(" ");
}

/**
 * Decide o termo de busca de um item, por prioridade:
 * 1. `palavrasChave` definidas manualmente no item (vontade explícita do usuário);
 * 2. `termoBuscaIA` gerado na extração do TR (substantivo-núcleo + qualificadores —
 *    muito melhor que o início da descrição crua, que pode ser "Fornecimento e
 *    instalação de...");
 * 3. fallback heurístico sobre a descrição.
 */
export function resolverTermoBusca(params: {
  descricao: string;
  palavrasChave?: string[];
  termoBuscaIA?: string | null;
}): string {
  const { descricao, palavrasChave = [], termoBuscaIA } = params;
  if (palavrasChave.length > 0) return extrairTermoBusca(descricao, palavrasChave);

  const termoIA = termoBuscaIA?.trim();
  if (termoIA) return termoIA;

  return extrairTermoBusca(descricao);
}
