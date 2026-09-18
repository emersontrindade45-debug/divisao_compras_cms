/**
 * Teto de preços públicos escritos por item numa passada de preenchimento da
 * planilha de cotação.
 *
 * Vive num módulo próprio (sem `server-only` nem googleapis) porque é lido em
 * dois pontos que não podem divergir: o `take` da consulta Prisma
 * (`lib/actions/preencherCotacao.ts`) e o corte da escrita
 * (`lib/sheets/preencherPrecosPublicos.ts`). Quando eram duas constantes
 * separadas, o menor mandava em silêncio — no processo 1829/2024 (2026-08-31)
 * um item com 6 candidatos ativos escreveu 5 preços numa planilha que tinha 14
 * colunas "Preço Público" livres, sem nada na tela indicando o corte.
 *
 * Não confundir com o limite REAL: quantas colunas "Preço Público" a planilha
 * tem. Este teto nunca cria coluna — item com mais preços do que colunas
 * disponíveis continua sendo reportado em `itensSemColunaDisponivel`.
 */
export const MAX_PRECOS_POR_ITEM = 50;

/*
 * **Era 10, subiu para 50 em 2026-09-18.** O usuário ampliou a planilha do
 * processo 0736/2025 para 33 colunas "Preço Público": o teto de 10 passou a
 * cortar bem abaixo do que a planilha comporta, que é o mesmo defeito de agosto
 * (5 contra 14 colunas) reaparecendo por cima. 50 dá folga sobre as 33 sem
 * autorizar escrita ilimitada — e o limite que realmente manda continua sendo o
 * número de colunas livres, já respeitado pelo laço de escrita e reportado em
 * `itensSemColunaDisponivel`.
 */
