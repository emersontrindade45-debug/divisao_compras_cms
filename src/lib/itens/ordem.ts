import type { Prisma } from "@prisma/client";

/**
 * Ordem dos itens de um processo: a do Termo de Referência (a mesma das linhas da planilha),
 * gravada em `Item.ordem` pela sincronização. Item sem ordem (preservado depois de sair da
 * planilha) vai para o fim; empate cai na ordem de criação. Uma só definição, para a lista de
 * cards e o seletor do assistente nunca divergirem.
 */
export const ORDEM_ITENS: Prisma.ItemOrderByWithRelationInput[] = [
  { ordem: { sort: "asc", nulls: "last" } },
  { createdAt: "asc" },
  { id: "asc" },
];

/** Número do item no TR: a ordem gravada, ou a posição na lista quando ainda não há ordem. */
export function numeroDoItem(ordem: number | null, posicao: number): number {
  return ordem ?? posicao;
}

/** "3. Descrição" — o número do TR junto do texto, para escolher o item sem abrir o TR. */
export function rotuloDoItem(numero: number | undefined, descricao: string): string {
  return numero === undefined ? descricao : `${numero}. ${descricao}`;
}
