/**
 * Chave de comparação de descrição de item de contratação pública: sem acento,
 * sem caixa, sem pontuação, espaços colapsados.
 *
 * A pontuação precisa sair porque a mesma compra publica a mesma frase com e
 * sem ponto final — "ACESSO INTERNET - LINK DEDICADO 600 MBPS." e "ACESSO
 * INTERNET - LINK DEDICADO 600 MBPS" apareceram lado a lado no mesmo resultado,
 * e com `trim().toLowerCase()` sozinho contavam como itens diferentes.
 *
 * Mora em módulo próprio (sem `import "server-only"`, sem Prisma) porque é
 * usada tanto pelas ferramentas do assistente quanto pelas server actions de
 * adição/descarte: as duas precisam concordar sobre o que é "o mesmo item de
 * uma contratação", e duas cópias da regra divergiriam (CLAUDE.md §9.62).
 */
export function chaveDescricao(descricao: string): string {
  return descricao
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
