import type { EscopoInstrucaoPesquisa } from "@prisma/client";

// Instruções de pesquisa (M13): regras escritas pelos próprios servidores para
// o assistente melhorar as buscas de similaridade ao longo do tempo.
//
// Aplicadas em três níveis, do mais geral ao mais específico. A ordem importa:
// o texto mais específico vem por último para que, quando duas regras
// conflitarem, a mais próxima do caso concreto seja a última coisa que o modelo
// lê — que é onde os modelos de linguagem dão mais peso.
//
// Módulo puro: recebe as instruções já carregadas. Quem lê do banco é a action.

/**
 * Teto por nível. Existe para limitar custo: as instruções entram no prompt de
 * TODA busca e de TODO ranking, então texto longo multiplica tokens por
 * candidato avaliado.
 */
export const LIMITE_CARACTERES_INSTRUCAO = 4000;

export interface InstrucaoCarregada {
  escopo: EscopoInstrucaoPesquisa;
  categoria?: string | null;
  conteudo: string;
  ativo?: boolean;
}

/** Ordem de aplicação: do mais geral para o mais específico. */
const ORDEM_ESCOPO: Record<EscopoInstrucaoPesquisa, number> = {
  global: 0,
  categoria: 1,
  processo: 2,
};

const ROTULO_ESCOPO: Record<EscopoInstrucaoPesquisa, string> = {
  global: "Regras gerais de pesquisa (valem para todos os objetos)",
  categoria: "Regras da categoria do item",
  processo: "Regras específicas deste processo",
};

/**
 * Chave única de uma instrução. Precisa existir porque uma constraint composta
 * sobre colunas anuláveis não garante unicidade no Postgres — NULL é distinto de
 * NULL, então dois registros globais passariam (CLAUDE.md §9.14).
 */
export function chaveInstrucao(
  escopo: EscopoInstrucaoPesquisa,
  alvo: { categoria?: string | null; processoId?: string | null } = {},
): string {
  switch (escopo) {
    case "global":
      return "global";
    case "categoria": {
      const categoria = alvo.categoria?.trim().toLowerCase();
      if (!categoria) {
        throw new Error("Instrução de escopo 'categoria' exige uma categoria.");
      }
      return `categoria:${categoria}`;
    }
    case "processo": {
      const processoId = alvo.processoId?.trim();
      if (!processoId) {
        throw new Error("Instrução de escopo 'processo' exige um processoId.");
      }
      return `processo:${processoId}`;
    }
  }
}

/**
 * Concatena as instruções aplicáveis num bloco rotulado para o prompt.
 *
 * Devolve string vazia quando não há nada — o chamador então não injeta seção
 * alguma, em vez de mandar um cabeçalho órfão que o modelo tenta interpretar.
 */
export function montarInstrucoesPesquisa(instrucoes: InstrucaoCarregada[]): string {
  const aplicaveis = instrucoes
    .filter((i) => i.ativo !== false)
    .filter((i) => i.conteudo.trim().length > 0)
    .sort((a, b) => ORDEM_ESCOPO[a.escopo] - ORDEM_ESCOPO[b.escopo]);

  if (aplicaveis.length === 0) return "";

  const blocos = aplicaveis.map((instrucao) => {
    const rotulo =
      instrucao.escopo === "categoria" && instrucao.categoria
        ? `${ROTULO_ESCOPO.categoria} (${instrucao.categoria})`
        : ROTULO_ESCOPO[instrucao.escopo];
    const conteudo = instrucao.conteudo.trim().slice(0, LIMITE_CARACTERES_INSTRUCAO);
    return `### ${rotulo}\n${conteudo}`;
  });

  return [
    "## Instruções de pesquisa definidas pela Divisão de Compras",
    "Siga estas regras ao escolher termos de busca e ao avaliar similaridade.",
    "Quando duas regras conflitarem, vale a mais específica (a que aparece por último).",
    "",
    blocos.join("\n\n"),
  ].join("\n");
}
