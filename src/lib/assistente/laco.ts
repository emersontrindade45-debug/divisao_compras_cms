import type { CandidatoSugerido } from "./sugestoes";

// Laço agentico do assistente (M13).
//
// Deliberadamente agnóstico de provedor: recebe um `ModeloConversacional` e um
// executor de ferramentas por injeção. Isso permite testar orçamento, ordem das
// chamadas e tratamento de erro sem tocar na OpenAI — e trocar de provedor sem
// reescrever a orquestração.

/**
 * Teto de chamadas de ferramenta por MENSAGEM do usuário.
 *
 * Não é um limite de produto: ao longo da conversa o usuário pode pedir "continue
 * procurando" quantas vezes quiser, e cada pedido ganha um orçamento novo. O teto
 * existe por duas razões concretas: o timeout da função serverless na Vercel e o
 * custo por chamada de busca. Ao esgotar, o laço NUNCA para em silêncio — pede ao
 * modelo um fechamento e marca `orcamentoEsgotado`, que a UI transforma no botão
 * "Continuar procurando" (CLAUDE.md §9.40).
 */
export const MAX_PASSOS_POR_TURNO = 8;

/**
 * Teto de TEMPO gasto com ferramentas por mensagem do usuário.
 *
 * O teto de passos não bastava: uma única `buscar_pncp` pode custar dezenas de
 * segundos — medido contra a API real em 2026-08-10, o termo "lavagem fachada
 * predio novo pastilhas pele de vidro" gastou 11s e 82 requisições HTTP com
 * apenas 7 editais; com os 20 que a busca textual pode devolver, passa de 30s.
 * Duas buscas assim estouram o `maxDuration = 60` da rota.
 *
 * E estourar o `maxDuration` não é uma falha benigna: a Vercel mata a função no
 * meio do stream SSE, o cliente nunca recebe `fim` nem `erro`, e o passo em
 * andamento gira para sempre — junto com ele, os candidatos já encontrados ficam
 * inaprováveis, porque o `mensagemId` só chega no `fim`.
 *
 * 35s deixa ~25s de folga para o fechamento com o modelo (teto de 15s), a
 * gravação da mensagem e a auditoria. Ao esgotar, o caminho é o MESMO do teto de
 * passos: pede fechamento ao modelo e marca `orcamentoEsgotado`, que a UI
 * transforma no botão "Continuar procurando".
 *
 * O orçamento é conferido ANTES de cada ferramenta, então ele não interrompe uma
 * ferramenta já em curso — quem limita essa ponta são os tetos internos de cada
 * integração (ver `TEMPO_MAX_BUSCA_MS` no PNCP). A combinação cobre o caso comum
 * com folga; para a cauda que ainda assim estourar, a rede de segurança é o
 * cliente tratar stream truncado (`AssistenteChat`), não este número.
 */
export const ORCAMENTO_TEMPO_TURNO_MS = 35_000;

/** Quantos caracteres de resultado de ferramenta entram no rastro exibido. */
const TAMANHO_RESUMO_PASSO = 500;

export interface ChamadaFerramenta {
  id: string;
  nome: string;
  argumentos: string;
}

export interface RespostaModelo {
  /** Texto para o usuário. Pode vir vazio quando o modelo só pede ferramentas. */
  texto: string;
  chamadas: ChamadaFerramenta[];
}

export interface ResultadoFerramenta {
  /** Conteúdo devolvido ao modelo (JSON serializado ou texto). */
  conteudo: string;
  /** Preenchido quando a ferramenta falhou; o laço segue, o modelo decide o quê fazer. */
  erro?: string;
  /**
   * Candidatos que a busca achou e que o usuário pode aprovar por clique.
   * Trafegam pelo passo porque precisam ser persistidos com a mensagem: é de lá
   * que o servidor relê o preço na hora da aprovação, nunca do navegador.
   */
  sugestoes?: CandidatoSugerido[];
}

/** Registro de um passo, exibido na UI e persistido em `ferramentasUsadas`. */
export interface PassoRegistrado {
  ferramenta: string;
  argumentos: string;
  resumo: string;
  duracaoMs: number;
  erro?: string;
  sugestoes?: CandidatoSugerido[];
}

export interface TurnoMensagem {
  papel: "user" | "assistant" | "tool";
  conteudo: string;
  /** Presente em mensagens `tool`: id da chamada que originou o resultado. */
  chamadaId?: string;
  /** Presente em mensagens `assistant` que pediram ferramentas. */
  chamadas?: ChamadaFerramenta[];
}

export interface ModeloConversacional {
  /**
   * @param permitirFerramentas quando false, o modelo deve responder só com
   * texto — é assim que se obtém o fechamento no fim do orçamento.
   */
  responder(
    historico: TurnoMensagem[],
    permitirFerramentas: boolean,
  ): Promise<RespostaModelo>;
}

export type ExecutorFerramenta = (chamada: ChamadaFerramenta) => Promise<ResultadoFerramenta>;

export type EventoTurno =
  | { tipo: "passo_inicio"; ferramenta: string; argumentos: string }
  | { tipo: "passo_fim"; passo: PassoRegistrado }
  | { tipo: "texto"; texto: string };

export interface OpcoesTurno {
  historico: TurnoMensagem[];
  modelo: ModeloConversacional;
  executar: ExecutorFerramenta;
  maxPassos?: number;
  /** Teto de tempo de ferramentas. Ver `ORCAMENTO_TEMPO_TURNO_MS`. */
  orcamentoMs?: number;
  onEvento?: (evento: EventoTurno) => void;
  agora?: () => number;
}

export interface ResultadoTurno {
  texto: string;
  passos: PassoRegistrado[];
  /**
   * true quando o laço parou por teto (de passos ou de tempo), não por decisão
   * do modelo. Os dois casos são a mesma coisa para a UI: ainda há caminho a
   * seguir, e o usuário decide se quer gastar outro turno nele.
   */
  orcamentoEsgotado: boolean;
  /** Histórico acrescido das mensagens do turno, pronto para persistir. */
  historico: TurnoMensagem[];
}

function resumir(texto: string): string {
  return texto.length > TAMANHO_RESUMO_PASSO
    ? `${texto.slice(0, TAMANHO_RESUMO_PASSO)}…`
    : texto;
}

/**
 * Executa um turno completo: alterna entre pedir resposta ao modelo e rodar as
 * ferramentas que ele solicitar, até o modelo responder sem pedir ferramenta ou
 * o orçamento acabar.
 *
 * Falha de ferramenta não aborta o turno. O erro volta ao modelo como resultado,
 * que então decide tentar outro termo, outra fonte, ou explicar ao usuário — que
 * é o comportamento útil quando o PNCP está fora do ar e a web ainda funciona.
 */
export async function executarTurno(opcoes: OpcoesTurno): Promise<ResultadoTurno> {
  const {
    historico: historicoInicial,
    modelo,
    executar,
    maxPassos = MAX_PASSOS_POR_TURNO,
    orcamentoMs = ORCAMENTO_TEMPO_TURNO_MS,
    onEvento,
    agora = () => Date.now(),
  } = opcoes;

  const historico: TurnoMensagem[] = [...historicoInicial];
  const passos: PassoRegistrado[] = [];
  const inicioTurno = agora();
  let textoFinal = "";
  let orcamentoEsgotado = false;

  // O tempo é medido, e não estimado, porque o custo de uma busca varia em uma
  // ordem de grandeza conforme o termo: uma compra com 1.039 itens obriga a
  // paginar `/itens` três vezes, outra resolve em uma requisição.
  const tempoEsgotado = () => agora() - inicioTurno >= orcamentoMs;

  // `maxPassos` conta ferramentas executadas, não idas ao modelo. Um orçamento
  // de 0 é válido e significa "responda sem pesquisar".
  while (true) {
    const podeUsarFerramentas = passos.length < maxPassos && !tempoEsgotado();
    const resposta = await modelo.responder(historico, podeUsarFerramentas);

    if (resposta.texto) {
      textoFinal = resposta.texto;
      onEvento?.({ tipo: "texto", texto: resposta.texto });
    }

    if (resposta.chamadas.length === 0) {
      historico.push({ papel: "assistant", conteudo: resposta.texto });
      break;
    }

    historico.push({
      papel: "assistant",
      conteudo: resposta.texto,
      chamadas: resposta.chamadas,
    });

    // O modelo pode pedir mais ferramentas do que o orçamento restante permite;
    // executa-se o que cabe, e o restante entra como resultado explicando o corte
    // — melhor do que ignorar a chamada e deixar o modelo esperando.
    for (const chamada of resposta.chamadas) {
      // O tempo é reavaliado a CADA chamada, não uma vez por rodada: o modelo
      // costuma pedir várias buscas de uma vez, e sem esta checagem a primeira
      // delas poderia consumir o orçamento inteiro e as seguintes rodariam
      // assim mesmo, estourando o `maxDuration`.
      const semTempo = tempoEsgotado();
      if (passos.length >= maxPassos || semTempo) {
        orcamentoEsgotado = true;
        historico.push({
          papel: "tool",
          chamadaId: chamada.id,
          conteudo: JSON.stringify({
            erro: semTempo
              ? "Tempo de pesquisa deste turno esgotado. Não execute mais ferramentas: " +
                "responda ao usuário com o que já encontrou e diga o que tentaria em seguida."
              : "Orçamento de buscas deste turno esgotado. Não execute mais ferramentas: " +
                "responda ao usuário com o que já encontrou e diga o que tentaria em seguida.",
          }),
        });
        continue;
      }

      onEvento?.({
        tipo: "passo_inicio",
        ferramenta: chamada.nome,
        argumentos: chamada.argumentos,
      });

      const inicio = agora();
      let resultado: ResultadoFerramenta;
      try {
        resultado = await executar(chamada);
      } catch (erro) {
        resultado = {
          conteudo: JSON.stringify({
            erro: erro instanceof Error ? erro.message : String(erro),
          }),
          erro: erro instanceof Error ? erro.message : String(erro),
        };
      }

      const passo: PassoRegistrado = {
        ferramenta: chamada.nome,
        argumentos: chamada.argumentos,
        resumo: resumir(resultado.conteudo),
        duracaoMs: agora() - inicio,
        ...(resultado.erro ? { erro: resultado.erro } : {}),
        ...(resultado.sugestoes?.length ? { sugestoes: resultado.sugestoes } : {}),
      };
      passos.push(passo);
      onEvento?.({ tipo: "passo_fim", passo });

      historico.push({
        papel: "tool",
        chamadaId: chamada.id,
        conteudo: resultado.conteudo,
      });
    }

    if (passos.length >= maxPassos || tempoEsgotado()) {
      orcamentoEsgotado = true;
      // Fechamento obrigatório: sem esta chamada o turno terminaria com o último
      // texto do modelo (frequentemente vazio, porque ele estava pedindo
      // ferramentas), e o usuário veria uma resposta em branco.
      const fechamento = await modelo.responder(historico, false);
      textoFinal = fechamento.texto;
      onEvento?.({ tipo: "texto", texto: fechamento.texto });
      historico.push({ papel: "assistant", conteudo: fechamento.texto });
      break;
    }
  }

  return { texto: textoFinal, passos, orcamentoEsgotado, historico };
}
