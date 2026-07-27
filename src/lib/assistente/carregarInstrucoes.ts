import "server-only";
import { db } from "@/lib/db";
import type { InstrucaoCarregada } from "./instrucoes";

// Carregamento das instruções de pesquisa aplicáveis a uma conversa (M13).
//
// Separado de `instrucoes.ts` de propósito: aquele módulo é puro (só compõe
// texto) e é testado sem mock de Prisma. A leitura do banco mora aqui.

/**
 * Escolhe quais instruções de escopo `categoria` valem para um processo.
 *
 * `ClassificacaoItem` só tem `comum`/`especifico`, que não serve como categoria
 * de pesquisa — a categoria de uma instrução é texto livre escrito pelo servidor
 * ("mobiliário", "informática", "gêneros alimentícios"). Como não há campo de
 * categoria no `Item`, o casamento é textual: a instrução se aplica quando sua
 * categoria aparece no objeto do processo, na descrição de algum item ou nas
 * palavras-chave.
 *
 * Função pura, exportada para ser testada sem banco.
 */
export function categoriasAplicaveis(
  categoriasDisponiveis: string[],
  textoDoProcesso: string,
): string[] {
  const alvo = textoDoProcesso.toLowerCase();
  return categoriasDisponiveis.filter((categoria) => {
    const termo = categoria.trim().toLowerCase();
    return termo.length > 0 && alvo.includes(termo);
  });
}

/**
 * Lê as instruções ativas aplicáveis: global sempre, categoria por casamento
 * textual, processo quando a conversa está presa a um.
 *
 * Devolve na ordem crua do banco; quem ordena por especificidade é
 * `montarInstrucoesPesquisa`.
 */
export async function carregarInstrucoes(
  processoId: string | null,
): Promise<InstrucaoCarregada[]> {
  const [globais, deCategoria] = await Promise.all([
    db.instrucaoPesquisa.findMany({
      where: { escopo: "global", ativo: true },
      select: { escopo: true, categoria: true, conteudo: true, ativo: true },
    }),
    db.instrucaoPesquisa.findMany({
      where: { escopo: "categoria", ativo: true },
      select: { escopo: true, categoria: true, conteudo: true, ativo: true },
    }),
  ]);

  if (!processoId) return [...globais];

  const processo = await db.processo.findUnique({
    where: { id: processoId },
    select: {
      objeto: true,
      itens: { select: { descricao: true, palavrasChave: true } },
    },
  });

  const texto = processo
    ? [
        processo.objeto,
        ...processo.itens.map((i) => i.descricao),
        ...processo.itens.flatMap((i) => i.palavrasChave),
      ].join(" ")
    : "";

  const nomes = deCategoria
    .map((i) => i.categoria)
    .filter((c): c is string => Boolean(c));
  const aplicaveis = new Set(categoriasAplicaveis(nomes, texto));

  const doProcesso = await db.instrucaoPesquisa.findMany({
    where: { escopo: "processo", processoId, ativo: true },
    select: { escopo: true, categoria: true, conteudo: true, ativo: true },
  });

  return [
    ...globais,
    ...deCategoria.filter((i) => i.categoria && aplicaveis.has(i.categoria)),
    ...doProcesso,
  ];
}
