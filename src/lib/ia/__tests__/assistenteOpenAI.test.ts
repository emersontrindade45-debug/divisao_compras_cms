import { describe, it, expect, afterEach, vi } from "vitest";
import type { Responses } from "openai/resources/responses/responses";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../openaiClient", () => ({
  getOpenAIClient: () => ({ responses: { create: mocks.create } }),
}));

import {
  AssistenteOpenAI,
  historicoParaInput,
  interpretarResposta,
  modeloAssistente,
  MODELO_ASSISTENTE_PADRAO,
} from "../assistenteOpenAI";
import type { TurnoMensagem } from "@/lib/assistente/laco";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("modeloAssistente", () => {
  it("usa o padrão quando a variável não está definida", () => {
    vi.stubEnv("OPENAI_ASSISTENTE_MODEL", "");
    expect(modeloAssistente()).toBe(MODELO_ASSISTENTE_PADRAO);
  });

  it("respeita a variável de ambiente", () => {
    vi.stubEnv("OPENAI_ASSISTENTE_MODEL", "gpt-5.5");
    expect(modeloAssistente()).toBe("gpt-5.5");
  });

  it("ignora valor só com espaços", () => {
    vi.stubEnv("OPENAI_ASSISTENTE_MODEL", "   ");
    expect(modeloAssistente()).toBe(MODELO_ASSISTENTE_PADRAO);
  });

  // O modelo do M10 é fraco para orquestrar laço de ferramentas; se alguém
  // rebaixar o padrão para ele, este teste avisa.
  it("não usa o gpt-4o-mini do pipeline de similaridade", () => {
    expect(MODELO_ASSISTENTE_PADRAO).not.toBe("gpt-4o-mini");
  });
});

describe("historicoParaInput", () => {
  it("converte mensagem do usuário", () => {
    const input = historicoParaInput([{ papel: "user", conteudo: "procure contratos" }]);
    expect(input).toEqual([{ role: "user", content: "procure contratos" }]);
  });

  it("converte resposta textual do assistente", () => {
    const input = historicoParaInput([{ papel: "assistant", conteudo: "achei 3" }]);
    expect(input).toEqual([{ role: "assistant", content: "achei 3" }]);
  });

  // Texto vazio é o caso normal quando o modelo só pede ferramenta; a API
  // rejeita uma mensagem de conteúdo vazio.
  it("omite mensagem de assistente sem texto", () => {
    const input = historicoParaInput([
      {
        papel: "assistant",
        conteudo: "",
        chamadas: [{ id: "call_1", nome: "buscar_pncp", argumentos: "{}" }],
      },
    ]);

    expect(input).toHaveLength(1);
    expect(input[0]).toMatchObject({ type: "function_call", call_id: "call_1" });
  });

  it("expande várias chamadas de uma mesma resposta", () => {
    const input = historicoParaInput([
      {
        papel: "assistant",
        conteudo: "",
        chamadas: [
          { id: "c1", nome: "a", argumentos: "{}" },
          { id: "c2", nome: "b", argumentos: "{}" },
        ],
      },
    ]);

    expect(input).toHaveLength(2);
    expect(input.map((i) => (i as { call_id: string }).call_id)).toEqual(["c1", "c2"]);
  });

  // Perder o pareamento call_id → function_call_output faz a API rejeitar a
  // requisição inteira, e o erro que volta não aponta a causa.
  it("pareia o resultado da ferramenta pelo call_id", () => {
    const historico: TurnoMensagem[] = [
      { papel: "user", conteudo: "x" },
      {
        papel: "assistant",
        conteudo: "",
        chamadas: [{ id: "call_abc", nome: "buscar_pncp", argumentos: '{"termo":"cadeira"}' }],
      },
      { papel: "tool", chamadaId: "call_abc", conteudo: '{"total":3}' },
    ];

    const input = historicoParaInput(historico);

    expect(input[1]).toMatchObject({ type: "function_call", call_id: "call_abc" });
    expect(input[2]).toMatchObject({
      type: "function_call_output",
      call_id: "call_abc",
      output: '{"total":3}',
    });
  });

  it("preserva a ordem cronológica do histórico", () => {
    const input = historicoParaInput([
      { papel: "user", conteudo: "primeira" },
      { papel: "assistant", conteudo: "segunda" },
      { papel: "user", conteudo: "terceira" },
    ]);

    expect(input.map((i) => (i as { content: string }).content)).toEqual([
      "primeira",
      "segunda",
      "terceira",
    ]);
  });
});

function mensagem(
  texto: string,
  annotations: unknown[] = [],
): Responses.ResponseOutputItem {
  return {
    type: "message",
    id: "msg_1",
    role: "assistant",
    status: "completed",
    content: [
      {
        type: "output_text",
        text: texto,
        annotations: annotations as never,
      },
    ],
  } as Responses.ResponseOutputItem;
}

describe("interpretarResposta", () => {
  it("extrai o texto da mensagem", () => {
    const res = interpretarResposta([mensagem("Encontrei 3 contratos.")]);
    expect(res.texto).toBe("Encontrei 3 contratos.");
    expect(res.chamadas).toHaveLength(0);
  });

  it("extrai chamadas de ferramenta", () => {
    const res = interpretarResposta([
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "buscar_pncp",
        arguments: '{"termo":"cadeira"}',
        status: "completed",
      } as Responses.ResponseOutputItem,
    ]);

    expect(res.chamadas).toEqual([
      { id: "call_1", nome: "buscar_pncp", argumentos: '{"termo":"cadeira"}' },
    ]);
  });

  it("coleta citações de url_citation", () => {
    const res = interpretarResposta([
      mensagem("Veja a ata.", [
        {
          type: "url_citation",
          url: "https://campinas.sp.gov.br/arp",
          title: "ARP 55/2025",
          start_index: 0,
          end_index: 10,
        },
      ]),
    ]);

    expect(res.citacoes).toEqual([
      { url: "https://campinas.sp.gov.br/arp", titulo: "ARP 55/2025" },
    ]);
  });

  it("não duplica a mesma URL citada em trechos diferentes", () => {
    const url = "https://x.gov.br/ata";
    const res = interpretarResposta([
      mensagem("a", [{ type: "url_citation", url, title: "T", start_index: 0, end_index: 1 }]),
      mensagem("b", [{ type: "url_citation", url, title: "T", start_index: 0, end_index: 1 }]),
    ]);

    expect(res.citacoes).toHaveLength(1);
  });

  it("cai para a URL quando a citação não tem título", () => {
    const res = interpretarResposta([
      mensagem("a", [
        { type: "url_citation", url: "https://x.gov.br", title: "", start_index: 0, end_index: 1 },
      ]),
    ]);

    expect(res.citacoes[0]!.titulo).toBe("https://x.gov.br");
  });

  it("ignora anotações que não são citação de URL", () => {
    const res = interpretarResposta([
      mensagem("a", [{ type: "file_citation", file_id: "f1", index: 0 }]),
    ]);

    expect(res.citacoes).toHaveLength(0);
  });

  it("combina texto e chamadas na mesma resposta", () => {
    const res = interpretarResposta([
      mensagem("Vou procurar no PNCP."),
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "buscar_pncp",
        arguments: "{}",
        status: "completed",
      } as Responses.ResponseOutputItem,
    ]);

    expect(res.texto).toBe("Vou procurar no PNCP.");
    expect(res.chamadas).toHaveLength(1);
  });

  it("devolve texto vazio quando o output só tem chamadas", () => {
    const res = interpretarResposta([
      {
        type: "function_call",
        id: "fc_1",
        call_id: "c1",
        name: "a",
        arguments: "{}",
        status: "completed",
      } as Responses.ResponseOutputItem,
    ]);

    expect(res.texto).toBe("");
  });

  it("ignora itens de tipo desconhecido sem quebrar", () => {
    const res = interpretarResposta([
      { type: "web_search_call", id: "ws_1", status: "completed" } as Responses.ResponseOutputItem,
      mensagem("resultado"),
    ]);

    expect(res.texto).toBe("resultado");
  });
});

// ---------------------------------------------------------------------------
// Nenhum tool HOSPEDADO na requisição. Este teste existe porque o `web_search`
// hospedado esteve ligado por meses e encerrava o turno: a OpenAI o executa
// dentro da própria requisição e devolve texto sem `chamadas`, então
// `executarTurno` faz `break` e `buscar_pncp` nunca roda — o analista recebia
// a resposta em texto, sem card nenhum e sem candidato gravado. A asserção é
// sobre o PAYLOAD enviado, e não sobre uma flag intermediária: era exatamente
// aí que a feature morria (CLAUDE.md §9.99).
// ---------------------------------------------------------------------------
describe("AssistenteOpenAI — ferramentas enviadas à OpenAI", () => {
  const FERRAMENTA = {
    nome: "buscar_pncp",
    descricao: "Busca contratações públicas.",
    parametros: { type: "object", properties: {} },
  };

  function provedor() {
    return new AssistenteOpenAI({
      instrucoesSistema: "instruções",
      ferramentas: [FERRAMENTA],
    });
  }

  afterEach(() => {
    mocks.create.mockReset();
  });

  it("envia só function tools — nenhum tool hospedado", async () => {
    mocks.create.mockResolvedValue({ output: [] });

    await provedor().responder([{ papel: "user", conteudo: "busque" }], true);

    const { tools } = mocks.create.mock.calls[0]![0] as { tools: Array<{ type: string }> };
    expect(tools.map((t) => t.type)).toEqual(["function"]);
    // Explícito porque foi este valor exato que quebrou o fluxo em produção.
    expect(tools.some((t) => t.type === "web_search")).toBe(false);
  });

  it("não manda ferramenta nenhuma quando o orçamento de passos acabou", async () => {
    // `permitirFerramentas: false` é o fechamento do turno: mandar definições
    // aqui pagaria tokens por ferramentas que não podem ser usadas.
    mocks.create.mockResolvedValue({ output: [] });

    await provedor().responder([{ papel: "user", conteudo: "busque" }], false);

    expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty("tools");
  });
});
