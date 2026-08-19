import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistenteChat } from "../AssistenteChat";
import { obterConversaAtiva } from "@/lib/actions/assistente";

// A server action que retoma a conversa do banco. Por padrão não há conversa
// anterior, que é o cenário da maioria dos casos; quem testa a retomada
// sobrescreve o retorno.
vi.mock("@/lib/actions/assistente", () => ({
  obterConversaAtiva: vi.fn(async () => null),
  listarItensDoProcesso: vi.fn(async () => []),
  adicionarCandidatoSugerido: vi.fn(async () => ({ ok: true, mensagem: "ok" })),
  completarLinksOrigemCandidatos: vi.fn(async () => ({ ok: true, urls: {} })),
}));

// `SugestoesCandidatos` chama `useRouter().refresh()` para a tabela de
// candidatos atualizar depois da aprovação. Fora do App Router o hook lança
// "invariant expected app router to be mounted" e derruba a árvore inteira.
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const obterConversaAtivaMock = vi.mocked(obterConversaAtiva);

// `scrollIntoView` não existe no jsdom.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  // `mockClear` explícito: `restoreAllMocks` do afterEach restaura implementações
  // espionadas, mas NÃO zera o histórico de chamadas de um mock de fábrica
  // (`vi.mock`). Sem isto, a asserção de "não foi chamada" enxerga as chamadas
  // dos casos anteriores e falha por vazamento, não por defeito.
  obterConversaAtivaMock.mockClear();
  obterConversaAtivaMock.mockResolvedValue(null);
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
  // `findByText` e não `getByText`: a tela agora consulta o banco antes de
  // decidir se mostra a apresentação ou o histórico retomado.
  it("mostra o que o assistente faz e o que não faz antes da primeira pergunta", async () => {
    render(<AssistenteChat processoId="proc-1" processoNumero="2026/0042" />);

    expect(await screen.findByText(/2026\/0042/)).toBeInTheDocument();
    // A promessa da tela precisa bater com a regra: o assistente grava
    // candidato, não fonte da estimativa.
    expect(screen.getByText("candidato")).toBeInTheDocument();
    expect(screen.getByText(/Promover candidato a fonte da estimativa/i)).toBeInTheDocument();
  });

  // O defeito que motivou a mudança: a conversa sempre foi gravada, mas nada
  // lia de volta. Fechar o painel perdia o histórico E criava conversa nova a
  // cada abertura, porque o `conversaId` voltava a ser nulo.
  it("retoma a conversa anterior do banco e continua nela", async () => {
    obterConversaAtivaMock.mockResolvedValue({
      conversaId: "conv-antiga",
      mensagens: [
        { id: "m1", papel: "user", conteudo: "procure brises", passos: [], citacoes: [] },
        { id: "m2", papel: "assistant", conteudo: "achei 5 contratos", passos: [], citacoes: [] },
      ],
    });
    const fetchMock = mockFetch(respostaSSE(TURNO_SIMPLES));

    render(<AssistenteChat processoId="proc-1" />);

    expect(await screen.findByText("procure brises")).toBeInTheDocument();
    expect(screen.getByText("achei 5 contratos")).toBeInTheDocument();

    // O que prova a continuidade não é o texto na tela, é o id que vai junto da
    // próxima mensagem: sem ele o servidor abriria outra conversa.
    perguntar("e agora?");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const corpo = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as {
      conversaId: string | null;
    };
    expect(corpo.conversaId).toBe("conv-antiga");
  });

  it("não retoma nada quando o painel pede conversa nova", async () => {
    obterConversaAtivaMock.mockResolvedValue({
      conversaId: "conv-antiga",
      mensagens: [
        { id: "m1", papel: "user", conteudo: "procure brises", passos: [], citacoes: [] },
      ],
    });

    render(<AssistenteChat processoId="proc-1" retomarConversa={false} />);

    expect(await screen.findByText(/Assistente de pesquisa/)).toBeInTheDocument();
    expect(obterConversaAtivaMock).not.toHaveBeenCalled();
    expect(screen.queryByText("procure brises")).not.toBeInTheDocument();
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
      expect(screen.getByText("Buscando preços e contratações públicas")).toBeInTheDocument();
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

  // -------------------------------------------------------------------------
  // Stream cortado no meio (CLAUDE.md §9.64).
  //
  // Quando a Vercel mata a função por `maxDuration`, o corpo da resposta fecha
  // sem `fim` nem `erro`. `lerStreamSSE` resolve normalmente — fim de stream é
  // indistinguível de fim de conteúdo — então o `catch` não roda e nada apaga o
  // `emAndamento`. Era o defeito relatado: o passo girava para sempre.
  // -------------------------------------------------------------------------

  const PASSO_ABERTO = [
    bloco("conversa", { conversaId: "conv-1" }),
    bloco("passo_inicio", {
      ferramenta: "buscar_pncp",
      argumentos: '{"termo":"lavagem fachada predio novo pastilhas pele de vidro"}',
    }),
  ];

  it("enquanto a busca corre, o passo aparece girando", async () => {
    // Controle do caso seguinte: prova que o seletor do spinner encontra algo
    // de verdade. Sem ele, `toBeNull()` lá embaixo passaria mesmo se a correção
    // fosse removida — bastaria eu ter errado a classe.
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const b of PASSO_ABERTO) controller.enqueue(encoder.encode(b));
        // Deliberadamente NÃO fecha: é o turno ainda em andamento.
      },
    });
    mockFetch(new Response(body, { status: 200 }));
    const { container } = render(<AssistenteChat processoId="proc-1" />);

    perguntar("procure");

    await waitFor(() => {
      expect(screen.getByText("Buscando preços e contratações públicas")).toBeInTheDocument();
    });
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("para de girar e avisa quando o stream fecha sem `fim` nem `erro`", async () => {
    mockFetch(respostaSSE(PASSO_ABERTO));
    const { container } = render(<AssistenteChat processoId="proc-1" />);

    perguntar("procure");

    await waitFor(() => {
      expect(screen.getByText(/interrompida antes de terminar/i)).toBeInTheDocument();
    });
    expect(container.querySelector(".animate-spin")).toBeNull();
    // O passo continua listado: o usuário precisa ver o que chegou a ser
    // tentado, e o termo é o que ele vai encurtar na próxima tentativa.
    expect(screen.getByText("Buscando preços e contratações públicas")).toBeInTheDocument();
  });

  it("o turno completo não dispara o aviso de interrupção", async () => {
    mockFetch(respostaSSE(TURNO_SIMPLES));
    render(<AssistenteChat processoId="proc-1" />);

    perguntar("procure");

    await waitFor(() => {
      expect(screen.getByText("Encontrei 3 contratações comparáveis.")).toBeInTheDocument();
    });
    expect(screen.queryByText(/interrompida antes de terminar/i)).not.toBeInTheDocument();
  });

  it("o evento `erro` do servidor prevalece sobre o aviso de interrupção", async () => {
    mockFetch(
      respostaSSE([
        ...PASSO_ABERTO,
        bloco("erro", { conversaId: "conv-1", mensagem: "O PNCP está fora do ar." }),
      ]),
    );
    const { container } = render(<AssistenteChat processoId="proc-1" />);

    perguntar("procure");

    await waitFor(() => {
      expect(screen.getByText("O PNCP está fora do ar.")).toBeInTheDocument();
    });
    // Erro explícito do servidor é um final legítimo: não pode ser sobrescrito
    // pela mensagem genérica de stream truncado, que diria a causa errada.
    expect(screen.queryByText(/interrompida antes de terminar/i)).not.toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});
