import "server-only";
import type { Responses } from "openai/resources/responses/responses";
import { getOpenAIClient } from "./openaiClient";
import type {
  ChamadaFerramenta,
  ModeloConversacional,
  RespostaModelo,
  TurnoMensagem,
} from "@/lib/assistente/laco";

// Provedor de chat do assistente (M13).
//
// Usa a **Responses API**, não `chat.completions` como o resto de `lib/ia/`. O
// pipeline de similaridade segue em `chat.completions` — este módulo não o
// altera.
//
// **O tool hospedado `web_search` foi REMOVIDO em 2026-08-26. Não reintroduzir
// sem resolver os quatro problemas abaixo.** Ele era atraente por vir pronto e
// devolver anotações `url_citation`, e custou ao analista uma tarde inteira de
// respostas sem card nenhum:
//
// 1. **Encerrava o turno.** A OpenAI executa o tool hospedado DENTRO da mesma
//    requisição e devolve texto pronto; `interpretarResposta` não produz
//    `chamadas`, e `executarTurno` faz `break` quando `chamadas.length === 0`.
//    Logo `buscar_pncp` nunca rodava depois dele — nenhum candidato gravado,
//    nenhum card na tela. Medido em produção (2026-08-26, 15:42): uma mensagem
//    com 3 citações e ZERO ferramentas, citando contratos do PNCP com
//    `?utm_source=openai` no link. A regra 4 do prompt de sistema ("ao achar
//    pela web, busque no PNCP no mesmo turno") era inalcançável: o laço já
//    tinha morrido.
// 2. **Sem lista branca nem vermelha.** A rota o habilitava sem
//    `dominiosPermitidos`, então marketplace não era bloqueado — e o resultado
//    nunca passava por `filtrarResultadosWeb` (`assistente/guardas.ts`), que é
//    onde a lista vermelha e a remoção de contratação da própria Câmara vivem.
// 3. **Fora da trilha de auditoria.** Não aparecia em
//    `MensagemAssistente.ferramentasUsadas`: não havia registro de qual busca
//    foi feita nem quanto custou.
// 4. **O achado não podia virar fonte de qualquer jeito.** Pela IN 65/2021,
//    resultado de site exige data/hora do acesso e captura do arquivo, que só o
//    módulo de Sites produz — então o texto que ele devolvia era, na melhor das
//    hipóteses, uma pista que o analista teria de refazer à mão.
//
// A descoberta na web aberta continua existindo, e melhor: `buscar_web`
// (Perplexity, em `assistente/ferramentas.ts`) é function tool de verdade —
// aplica as duas listas, passa pelas guardas, entra na auditoria e devolve o
// controle ao laço, que é o que permite ao modelo emendar um `buscar_pncp` e
// transformar o achado em card.

/**
 * Modelo do assistente, configurável por ambiente.
 *
 * O padrão NÃO é o `gpt-4o-mini` usado na extração/ranking do M10: aquele é
 * fraco para orquestrar um laço de ferramentas com várias rodadas. Os modelos
 * disponíveis foram conferidos contra a conta real via `GET /v1/models`, não
 * assumidos de memória (CLAUDE.md §2).
 */
export const MODELO_ASSISTENTE_PADRAO = "gpt-5.4-mini";

/**
 * Teto por chamada ao modelo. Dimensionado para caber no `maxDuration = 60` da
 * rota junto com o orçamento de ferramentas (`ORCAMENTO_TEMPO_TURNO_MS`): mesmo
 * quando o laço para no limite de tempo, ainda sobra folga para a chamada de
 * fechamento, a gravação da mensagem e a auditoria.
 */
const TIMEOUT_MODELO_MS = 15_000;

export function modeloAssistente(): string {
  return process.env.OPENAI_ASSISTENTE_MODEL?.trim() || MODELO_ASSISTENTE_PADRAO;
}

/** Definição de uma function tool exposta ao modelo. */
export interface DefinicaoFerramenta {
  nome: string;
  descricao: string;
  /** JSON Schema dos parâmetros. */
  parametros: Record<string, unknown>;
}

export interface Citacao {
  url: string;
  titulo: string;
}

export interface OpcoesProvedorChat {
  instrucoesSistema: string;
  ferramentas: DefinicaoFerramenta[];
}

/** Acumula as citações do último `responder`, para persistir junto da mensagem. */
export interface ResultadoComCitacoes extends RespostaModelo {
  citacoes: Citacao[];
}

type ItemEntrada = Responses.ResponseInputItem;

/**
 * Traduz o histórico do laço para o formato de `input` da Responses API.
 *
 * Mensagem `assistant` que pediu ferramentas vira N itens `function_call`, e
 * cada resultado vira um `function_call_output` casado pelo `call_id`. Perder
 * esse pareamento faz a API rejeitar a requisição inteira.
 */
export function historicoParaInput(historico: TurnoMensagem[]): ItemEntrada[] {
  const itens: ItemEntrada[] = [];

  for (const mensagem of historico) {
    if (mensagem.papel === "user") {
      itens.push({ role: "user", content: mensagem.conteudo });
      continue;
    }

    if (mensagem.papel === "assistant") {
      // Texto vazio é comum quando o modelo só pediu ferramenta; enviar uma
      // mensagem de conteúdo vazio é rejeitado pela API.
      if (mensagem.conteudo.trim()) {
        itens.push({ role: "assistant", content: mensagem.conteudo });
      }
      for (const chamada of mensagem.chamadas ?? []) {
        itens.push({
          type: "function_call",
          call_id: chamada.id,
          name: chamada.nome,
          arguments: chamada.argumentos,
        });
      }
      continue;
    }

    itens.push({
      type: "function_call_output",
      call_id: mensagem.chamadaId ?? "",
      output: mensagem.conteudo,
    });
  }

  return itens;
}

/** Extrai texto, chamadas de ferramenta e citações do output da Responses API. */
export function interpretarResposta(output: Responses.ResponseOutputItem[]): ResultadoComCitacoes {
  const partesTexto: string[] = [];
  const chamadas: ChamadaFerramenta[] = [];
  const citacoes = new Map<string, Citacao>();

  for (const item of output) {
    if (item.type === "function_call") {
      chamadas.push({
        id: item.call_id,
        nome: item.name,
        argumentos: item.arguments,
      });
      continue;
    }

    if (item.type !== "message") continue;

    for (const parte of item.content) {
      if (parte.type !== "output_text") continue;
      partesTexto.push(parte.text);

      for (const anotacao of parte.annotations ?? []) {
        if (anotacao.type !== "url_citation") continue;
        // Map por URL: a mesma fonte citada em vários trechos vira uma entrada.
        citacoes.set(anotacao.url, {
          url: anotacao.url,
          titulo: anotacao.title || anotacao.url,
        });
      }
    }
  }

  return {
    texto: partesTexto.join("\n").trim(),
    chamadas,
    citacoes: Array.from(citacoes.values()),
  };
}

/**
 * Implementação de `ModeloConversacional` sobre a Responses API.
 *
 * `permitirFerramentas: false` remove TODAS as ferramentas da requisição — é o
 * que garante o fechamento no fim do orçamento de passos. Passar
 * `tool_choice: "none"` seria equivalente, mas mandar as definições assim mesmo
 * pagaria tokens por elas sem nenhum uso possível.
 */
export class AssistenteOpenAI implements ModeloConversacional {
  private ultimasCitacoes: Citacao[] = [];

  constructor(private readonly opcoes: OpcoesProvedorChat) {}

  /** Citações acumuladas na última chamada a `responder`. */
  get citacoes(): Citacao[] {
    return this.ultimasCitacoes;
  }

  async responder(
    historico: TurnoMensagem[],
    permitirFerramentas: boolean,
  ): Promise<RespostaModelo> {
    const ai = getOpenAIClient();

    // Só function tools: nenhum tool hospedado. Um tool hospedado resolve dentro
    // da própria requisição e devolve texto sem `chamadas`, o que encerra o
    // turno e impede o card — ver o cabeçalho deste arquivo.
    const tools: Responses.Tool[] = [];
    if (permitirFerramentas) {
      for (const ferramenta of this.opcoes.ferramentas) {
        tools.push({
          type: "function",
          name: ferramenta.nome,
          description: ferramenta.descricao,
          parameters: ferramenta.parametros,
          // `strict` exigiria todos os campos obrigatórios e
          // additionalProperties:false em cada schema; parâmetros opcionais são
          // úteis aqui (ex.: filtro de categoria).
          strict: false,
        });
      }
    }

    const resposta = await ai.responses.create(
      {
        model: modeloAssistente(),
        instructions: this.opcoes.instrucoesSistema,
        input: historicoParaInput(historico),
        ...(tools.length > 0 ? { tools } : {}),
      },
      // O padrão do SDK é 10 MINUTOS de timeout com 2 retries — inofensivo num
      // script, fatal aqui: a rota tem `maxDuration = 60`, então uma chamada
      // pendurada não devolve erro, ela deixa a função ser morta no meio do
      // stream SSE e o cliente fica girando (CLAUDE.md §9.64).
      { timeout: TIMEOUT_MODELO_MS, maxRetries: 1 },
    );

    const interpretada = interpretarResposta(resposta.output);
    this.ultimasCitacoes = interpretada.citacoes;

    return { texto: interpretada.texto, chamadas: interpretada.chamadas };
  }
}
