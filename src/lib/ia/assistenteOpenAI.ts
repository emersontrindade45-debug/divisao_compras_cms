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
// Usa a **Responses API**, não `chat.completions` como o resto de `lib/ia/`.
// Motivo: só ela permite misturar, na mesma requisição, o tool hospedado
// `web_search` (que devolve anotações `url_citation` com URL e título) com as
// function tools do sistema. O pipeline de similaridade segue em
// `chat.completions` — este módulo não o altera.

/**
 * Modelo do assistente, configurável por ambiente.
 *
 * O padrão NÃO é o `gpt-4o-mini` usado na extração/ranking do M10: aquele é
 * fraco para orquestrar um laço de ferramentas com várias rodadas. Os modelos
 * disponíveis foram conferidos contra a conta real via `GET /v1/models`, não
 * assumidos de memória (CLAUDE.md §2).
 */
export const MODELO_ASSISTENTE_PADRAO = "gpt-5.4-mini";

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
  /**
   * Lista branca para o `web_search` hospedado. O filtro da OpenAI só aceita
   * allowlist — não há denylist —, então a lista vermelha (marketplaces) é
   * aplicada em código, nas guardas, sobre os resultados. Ver
   * `assistente/guardas.ts`.
   */
  dominiosPermitidos?: string[];
  /** Habilita o tool hospedado de busca web. */
  habilitarBuscaWeb?: boolean;
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

    const tools: Responses.Tool[] = [];
    if (permitirFerramentas) {
      if (this.opcoes.habilitarBuscaWeb) {
        const permitidos = this.opcoes.dominiosPermitidos ?? [];
        tools.push({
          type: "web_search",
          ...(permitidos.length > 0 ? { filters: { allowed_domains: permitidos } } : {}),
        });
      }
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

    const resposta = await ai.responses.create({
      model: modeloAssistente(),
      instructions: this.opcoes.instrucoesSistema,
      input: historicoParaInput(historico),
      ...(tools.length > 0 ? { tools } : {}),
    });

    const interpretada = interpretarResposta(resposta.output);
    this.ultimasCitacoes = interpretada.citacoes;

    return { texto: interpretada.texto, chamadas: interpretada.chamadas };
  }
}
