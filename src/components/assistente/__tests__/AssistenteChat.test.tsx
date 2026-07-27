import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistenteChat } from "../AssistenteChat";

// `scrollIntoView` não existe no jsdom.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function bloco(nome: string, dados: unknown): string {
  return `event: ${nome}\ndata: ${JSON.stringify(dados)}\n\n`;
}

/** Resposta 200 cujo corpo entrega os blocos SSE dados. */
function respostaSSE(blocos: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const b of blocos) controller.enqueue(encoder.encode(b));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function mockFetch(resposta: Response | (() => Response)) {
  // A assinatura vai no genérico, e não como parâmetros da implementação: sem
  // ela o vitest tipa `mock.calls` como tupla vazia e ler `calls[0][1].body`
  // não compila; declarar parâmetros não usados resolveria o tipo mas geraria
  // aviso de lint.
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
    typeof resposta === "function" ? resposta() : resposta,
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Digita no campo e envia pelo botão. */
function perguntar(texto: string) {
  fireEvent.change(screen.getByLabelText("Mensagem para o assistente"), {
    target: { value: texto },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
}

const TURNO_SIMPLES = [
  bloco("conversa", { conversaId: "conv-1", processoId: "proc-1" }),
  bloco("passo_inicio", { ferramenta: "buscar_pncp", argumentos: '{"termo":"cadeira giratória"}' }),
  bloco("passo_fim", { ferramenta: "buscar_pncp", resumo: "3 candidatos", duracaoMs: 900 }),
  bloco("fim", { texto: "Encontrei 3 contratações comparáveis.", citacoes: [] }),
];

describe("AssistenteChat", () => {
  it("mostra o que o assistente faz e o que não faz antes da primeira pergunta", () => {
    render(<AssistenteChat processoId="proc-1" processoNumero="2026/0042" />);

    expect(screen.getByText(/2026\/0042/)).toBeInTheDocument();
    // A promessa da tela precisa bater com a regra: o assistente grava
    // candidato, não fonte da estimativa.
    expect(screen.getByText("candidato")).toBeInTheDocument();
    expect(screen.getByText(/Promover candidato a fonte da estimativa/i)).toBeInTheDocument();
  });

  it("envia a pergunta e exibe a resposta do turno", async () => {
    const fetchMock = mockFetch(respostaSSE(TURNO_SIMPLES));
    render(<AssistenteChat processoId="proc-1" />);

    perguntar("procure outros candidatos para o item 2");

    await waitFor(() => {
      expect(screen.getByText("Encontrei 3 contratações comparáveis.")).toBeInTheDocument();
    });
    expect(screen.getByText("procure outros candidatos para o item 2")).toBeInTheDocument();

    const corpo = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as Record<string, unknown>;
    expect(corpo.mensagem).toBe("procure outros candidatos para o item 2");
    expect(corpo.processoId).toBe("proc-1");
    // Primeira mensagem: ainda não há conversa.
    expect(corpo.conversaId).toBeNull();
  });

  it("mostra o rastro de ferramentas em linguagem de servidor, não o nome interno", async () => {
    mockFetch(respostaSSE(TURNO_SIMPLES));
    render(<AssistenteChat processoId="proc-1" />);

    perguntar("procure");

    await waitFor(() => {
      expect(screen.getByText("Buscando contratações no PNCP")).toBeInTheDocument();
    });
    // O termo pesquisado aparece; o JSON cru dos argumentos, não.
    expect(screen.getByText(/cadeira giratória/)).toBeInTheDocument();
    expect(screen.queryByText(/\{"termo"/)).not.toBeInTheDocument();
  });

  it("reaproveita o conversaId nas mensagens seguintes", async () => {
    const fetchMock = mockFetch(() => respostaSSE(TURNO_SIMPLES));
    render(<AssistenteChat processoId="proc-1" />);

    perguntar("primeira");
    await waitFor(() => {
      expect(screen.getByText("Encontrei 3 contratações comparáveis.")).toBeInTheDocument();
    });

    perguntar("segunda");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const segundo = JSON.parse(String(fetchMock.mock.calls[1]![1]!.body)) as Record<string, unknown>;
    expect(segundo.conversaId).toBe("conv-1");
  });

  // CLAUDE.md §9.40: o turno não pode acabar em silêncio quando parou por teto
  // de passos — o usuário precisa saber que ainda há caminho.
  it("oferece 'Continuar procurando' quando o orçamento esgota", async () => {
    const fetchMock = mockFetch(() =>
      respostaSSE([
        bloco("conversa", { conversaId: "conv-1" }),
        bloco("fim", {
          texto: "Tentei 8 termos; nenhum trouxe candidato aderente.",
          citacoes: [],
          orcamentoEsgotado: true,
        }),
      ]),
    );
    render(<AssistenteChat processoId="proc-1" />);

    perguntar("procure");

    const botao = await screen.findByRole("button", { name: "Continuar procurando" });
    fireEvent.click(botao);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const segundo = JSON.parse(String(fetchMock.mock.calls[1]![1]!.body)) as Record<string, unknown>;
    expect(String(segundo.mensagem)).toMatch(/Continue procurando/i);
  });

  it("não mostra o botão de continuar quando o turno terminou por decisão do modelo", async () => {
    mockFetch(respostaSSE(TURNO_SIMPLES));
    render(<AssistenteChat processoId="proc-1" />);

    perguntar("procure");

    await waitFor(() => {
      expect(screen.getByText("Encontrei 3 contratações comparáveis.")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Continuar procurando" })).not.toBeInTheDocument();
  });

  it("exibe as citações como links abríveis", async () => {
    mockFetch(
      respostaSSE([
        bloco("conversa", { conversaId: "conv-1" }),
        bloco("fim", {
          texto: "Veja estas atas.",
          citacoes: [{ url: "https://tjsp.jus.br/ata/1", titulo: "Ata TJ-SP" }],
        }),
      ]),
    );
    render(<AssistenteChat />);

    perguntar("procure atas");

    const link = await screen.findByRole("link", { name: /Ata TJ-SP/ });
    expect(link).toHaveAttribute("href", "https://tjsp.jus.br/ata/1");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("mostra o erro que veio pelo stream e para de girar", async () => {
    mockFetch(
      respostaSSE([
        bloco("conversa", { conversaId: "conv-1" }),
        bloco("passo_inicio", { ferramenta: "buscar_pncp", argumentos: '{"termo":"x"}' }),
        bloco("erro", { mensagem: "OpenAI fora do ar" }),
      ]),
    );
    render(<AssistenteChat processoId="proc-1" />);

    perguntar("procure");

    await waitFor(() => expect(screen.getByText("OpenAI fora do ar")).toBeInTheDocument());
    // Passo aberto no momento da falha não pode ficar girando para sempre.
    expect(document.querySelector(".animate-spin")).toBeNull();
  });

  it("mostra o erro de uma resposta que não é stream (401/400)", async () => {
    mockFetch(
      new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(<AssistenteChat processoId="proc-1" />);

    perguntar("procure");

    await waitFor(() => expect(screen.getByText("Não autorizado")).toBeInTheDocument());
  });

  it("não envia mensagem vazia", () => {
    const fetchMock = mockFetch(respostaSSE(TURNO_SIMPLES));
    render(<AssistenteChat processoId="proc-1" />);

    fireEvent.change(screen.getByLabelText("Mensagem para o assistente"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envia com Enter e quebra linha com Shift+Enter", async () => {
    const fetchMock = mockFetch(() => respostaSSE(TURNO_SIMPLES));
    render(<AssistenteChat processoId="proc-1" />);

    const campo = screen.getByLabelText("Mensagem para o assistente");
    fireEvent.change(campo, { target: { value: "pergunta" } });
    fireEvent.keyDown(campo, { key: "Enter", shiftKey: true });
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.keyDown(campo, { key: "Enter" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("manda processoId nulo na conversa global", async () => {
    const fetchMock = mockFetch(respostaSSE(TURNO_SIMPLES));
    render(<AssistenteChat />);

    perguntar("quais processos estão parados?");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const corpo = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as Record<string, unknown>;
    expect(corpo.processoId).toBeNull();
  });
});
