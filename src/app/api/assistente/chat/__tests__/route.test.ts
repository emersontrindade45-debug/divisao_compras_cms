import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  registrarAuditoria: vi.fn(),
  db: {
    conversaAssistente: { findUnique: vi.fn(), create: vi.fn() },
    mensagemAssistente: { findMany: vi.fn(), create: vi.fn() },
    processo: { findUnique: vi.fn() },
  },
  montarRegistry: vi.fn(),
  carregarInstrucoes: vi.fn(),
  executarTurno: vi.fn(),
  perplexityConfigurada: vi.fn(),
  AssistenteOpenAI: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("@/lib/assistente/ferramentas", () => ({ montarRegistry: mocks.montarRegistry }));
vi.mock("@/lib/assistente/carregarInstrucoes", () => ({
  carregarInstrucoes: mocks.carregarInstrucoes,
}));
vi.mock("@/lib/integracoes/perplexity", () => ({
  perplexityConfigurada: mocks.perplexityConfigurada,
}));
vi.mock("@/lib/ia/assistenteOpenAI", () => ({
  AssistenteOpenAI: mocks.AssistenteOpenAI,
  modeloAssistente: () => "modelo-de-teste",
}));
vi.mock("@/lib/assistente/laco", async (original) => {
  const real = await original<typeof import("@/lib/assistente/laco")>();
  return { ...real, executarTurno: mocks.executarTurno };
});

import { POST } from "../route";

interface EventoSSE {
  nome: string;
  dados: Record<string, unknown>;
}

/** Lê o stream inteiro e devolve os eventos SSE já desserializados. */
async function lerEventos(res: Response): Promise<EventoSSE[]> {
  const texto = await res.text();
  return texto
    .split("\n\n")
    .filter((bloco) => bloco.trim())
    .map((bloco) => {
      const nome = /^event: (.+)$/m.exec(bloco)?.[1] ?? "";
      const dados = /^data: (.+)$/m.exec(bloco)?.[1] ?? "{}";
      return { nome, dados: JSON.parse(dados) as Record<string, unknown> };
    });
}

/**
 * Dispara a rota e ESPERA o stream terminar.
 *
 * O corpo do `ReadableStream` roda depois que `POST` já retornou: asserir sobre
 * gravação ou auditoria sem drenar o stream testa uma corrida, não o código.
 */
async function postCompleto(corpo: unknown): Promise<Response> {
  const res = await POST(requisicao(corpo));
  await res.clone().text();
  return res;
}

function requisicao(corpo: unknown): Request {
  return new Request("https://exemplo.test/api/assistente/chat", {
    method: "POST",
    body: JSON.stringify(corpo),
  });
}

describe("POST /api/assistente/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", role: "pesquisa", email: "u@e.com" });
    mocks.perplexityConfigurada.mockReturnValue(false);
    mocks.carregarInstrucoes.mockResolvedValue([]);
    mocks.db.conversaAssistente.create.mockResolvedValue({ id: "conv-nova", processoId: "proc-1" });
    mocks.db.mensagemAssistente.findMany.mockResolvedValue([]);
    mocks.db.mensagemAssistente.create.mockResolvedValue({ id: "msg-1" });
    mocks.db.processo.findUnique.mockResolvedValue({ numero: "2026/0042" });
    mocks.montarRegistry.mockReturnValue({ definicoes: [], executar: vi.fn() });
    // Precisa ser construivel: a rota faz `new AssistenteOpenAI(...)`.
    mocks.AssistenteOpenAI.mockImplementation(function (this: { citacoes: unknown[] }) {
      this.citacoes = [];
    });
    mocks.executarTurno.mockResolvedValue({
      texto: "Encontrei 3 contratações comparáveis.",
      passos: [{ ferramenta: "buscar_pncp", argumentos: "{}", resumo: "ok", duracaoMs: 12 }],
      orcamentoEsgotado: false,
      historico: [],
    });
  });

  it("nega acesso sem sessão, sem tocar no banco", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const res = await POST(requisicao({ mensagem: "oi" }));

    expect(res.status).toBe(401);
    expect(mocks.db.conversaAssistente.create).not.toHaveBeenCalled();
    expect(mocks.executarTurno).not.toHaveBeenCalled();
  });

  // O conversaId vem do cliente: sem checar o dono, qualquer usuário autenticado
  // leria (e continuaria) a conversa de outro só chutando o id.
  it("recusa conversa de outro usuário", async () => {
    mocks.db.conversaAssistente.findUnique.mockResolvedValue({
      id: "conv-alheia",
      processoId: "proc-9",
      userId: "outro-usuario",
    });

    const res = await POST(requisicao({ mensagem: "oi", conversaId: "conv-alheia" }));

    expect(res.status).toBe(404);
    expect(mocks.executarTurno).not.toHaveBeenCalled();
    expect(mocks.db.mensagemAssistente.create).not.toHaveBeenCalled();
  });

  // Regressão: o cliente inicializa `conversaId` num useRef com `null` e envia o
  // objeto inteiro, então a primeira mensagem de toda conversa chega com
  // `conversaId: null` — não ausente. Os demais testes daqui mandavam string ou
  // omitiam a chave, e por isso a suíte ficava verde com o chat 100% quebrado no
  // navegador (400 em toda mensagem). O corpo aqui é o que o fetch manda de fato.
  it("aceita a primeira mensagem com conversaId e processoId nulos", async () => {
    const res = await postCompleto({ mensagem: "procure cadeiras", conversaId: null, processoId: null });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);
    expect(mocks.db.conversaAssistente.create).toHaveBeenCalled();
    expect(mocks.executarTurno).toHaveBeenCalled();
  });

  it("recusa mensagem vazia", async () => {
    const res = await POST(requisicao({ mensagem: "" }));

    expect(res.status).toBe(400);
    expect(mocks.executarTurno).not.toHaveBeenCalled();
  });

  it("recusa corpo que não é JSON", async () => {
    const res = await POST(
      new Request("https://exemplo.test/api/assistente/chat", {
        method: "POST",
        body: "isto não é json",
      }),
    );

    expect(res.status).toBe(400);
  });

  it("responde como event-stream sem cache", async () => {
    const res = await POST(requisicao({ mensagem: "procure cadeiras", processoId: "proc-1" }));

    expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);
    expect(res.headers.get("Cache-Control")).toMatch(/no-cache/);
    // Sem isto, um proxy segura os eventos até o fim e o streaming não existe.
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
  });

  it("emite o id da conversa antes de rodar o turno", async () => {
    const res = await POST(requisicao({ mensagem: "procure cadeiras", processoId: "proc-1" }));
    const eventos = await lerEventos(res);

    // Primeiro evento: o cliente precisa do id mesmo que o turno falhe depois.
    expect(eventos[0]!.nome).toBe("conversa");
    expect(eventos[0]!.dados.conversaId).toBe("conv-nova");
  });

  it("persiste a mensagem do usuário e a resposta do assistente", async () => {
    await postCompleto({ mensagem: "procure cadeiras", processoId: "proc-1" });

    const papeis = mocks.db.mensagemAssistente.create.mock.calls.map((c) => c[0].data.papel);
    expect(papeis).toEqual(["user", "assistant"]);

    const gravadoAssistente = mocks.db.mensagemAssistente.create.mock.calls[1]![0].data;
    expect(gravadoAssistente.conteudo).toBe("Encontrei 3 contratações comparáveis.");
    expect(gravadoAssistente.ferramentasUsadas).toEqual([
      { ferramenta: "buscar_pncp", argumentos: "{}", resumo: "ok", duracaoMs: 12, erro: null },
    ]);
    expect(gravadoAssistente.modelo).toBe("modelo-de-teste");
  });

  it("não reenvia ao modelo as mensagens `tool` de turnos anteriores", async () => {
    // Do MAIS NOVO para o mais antigo: é o que a query devolve, porque o teto
    // de histórico precisa pegar as últimas N e não as primeiras N. O teste
    // abaixo prende essa ordenação, para o mock e a query não divergirem.
    mocks.db.mensagemAssistente.findMany.mockResolvedValue([
      { papel: "assistant", conteudo: "resposta anterior" },
      { papel: "tool", conteudo: '{"json":"gigante do PNCP"}' },
      { papel: "user", conteudo: "primeira pergunta" },
    ]);
    mocks.db.conversaAssistente.findUnique.mockResolvedValue({
      id: "conv-1",
      processoId: "proc-1",
      userId: "user-1",
    });

    await POST(requisicao({ mensagem: "e agora?", conversaId: "conv-1" }));

    const historico = mocks.executarTurno.mock.calls[0]![0].historico as Array<{
      papel: string;
      conteudo: string;
    }>;
    // Cronológico: o modelo precisa ler a conversa na ordem em que aconteceu.
    expect(historico.map((m) => m.papel)).toEqual(["user", "assistant", "user"]);
    expect(JSON.stringify(historico)).not.toContain("gigante do PNCP");
    // A mensagem nova entra por último.
    expect(historico.at(-1)!.conteudo).toBe("e agora?");
  });

  // O teto de 30 mensagens só preserva contexto se pegar as MAIS RECENTES. Com
  // `asc` + `take`, o banco devolveria as 30 mais ANTIGAS e uma conversa longa
  // reenviaria o começo dela ao modelo, sem nada do que acabou de ser dito — o
  // teto viraria amnésia. Este teste olha o argumento passado ao Prisma porque
  // o mock não ordena nada por conta própria.
  it("busca as mensagens mais recentes, não as mais antigas", async () => {
    mocks.db.conversaAssistente.findUnique.mockResolvedValue({
      id: "conv-1",
      processoId: "proc-1",
      userId: "user-1",
    });

    await postCompleto({ mensagem: "e agora?", conversaId: "conv-1" });

    const consulta = mocks.db.mensagemAssistente.findMany.mock.calls[0]![0] as {
      orderBy: { createdAt: string };
      take: number;
    };
    expect(consulta.orderBy).toEqual({ createdAt: "desc" });
    expect(consulta.take).toBe(30);
  });

  it("propaga orcamentoEsgotado no evento final", async () => {
    mocks.executarTurno.mockResolvedValue({
      texto: "Tentei 8 termos; nenhum trouxe candidato aderente.",
      passos: [],
      orcamentoEsgotado: true,
      historico: [],
    });

    const eventos = await lerEventos(
      await POST(requisicao({ mensagem: "procure", processoId: "proc-1" })),
    );

    const fim = eventos.find((e) => e.nome === "fim");
    // É o que a UI transforma no botão "Continuar procurando"; sem o campo, o
    // turno terminaria em silêncio (CLAUDE.md §9.40).
    expect(fim?.dados.orcamentoEsgotado).toBe(true);
    expect(fim?.dados.texto).toBeTruthy();
  });

  it("manda a falha pelo stream em vez de derrubar a resposta", async () => {
    mocks.executarTurno.mockRejectedValue(new Error("OpenAI fora do ar"));

    const res = await POST(requisicao({ mensagem: "procure", processoId: "proc-1" }));
    const eventos = await lerEventos(res);

    // O 200 já foi enviado com o primeiro evento: lançar aqui deixaria o cliente
    // com stream truncado e nada na tela.
    expect(res.status).toBe(200);
    const erro = eventos.find((e) => e.nome === "erro");
    expect(erro?.dados.mensagem).toMatch(/OpenAI fora do ar/);
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("audita o turno com o processo e as ferramentas usadas", async () => {
    await postCompleto({ mensagem: "procure", processoId: "proc-1" });

    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        processoId: "proc-1",
        acao: "assistente_turno",
        detalhes: expect.objectContaining({
          conversaId: "conv-nova",
          ferramentas: ["buscar_pncp"],
        }),
      }),
    );
  });

  it("cria conversa nova quando o processo da conversa existente não bate com o processo atual", async () => {
    // A conversa conv-1 está presa a proc-1; o cliente está agora em proc-2.
    // O comportamento correto é criar uma conversa nova para proc-2 em vez de
    // travar o usuário no contexto de proc-1 (o bug do "presa a outro processo").
    mocks.db.conversaAssistente.findUnique.mockResolvedValue({
      id: "conv-1",
      processoId: "proc-1",
      userId: "user-1",
    });
    mocks.db.conversaAssistente.create.mockResolvedValue({
      id: "conv-nova",
      processoId: "proc-2",
    });

    await POST(requisicao({ mensagem: "oi", conversaId: "conv-1", processoId: "proc-2" }));

    // Deve criar conversa nova para proc-2, não reusar conv-1 presa a proc-1.
    expect(mocks.db.conversaAssistente.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processoId: "proc-2" }) }),
    );
    expect(mocks.montarRegistry).toHaveBeenCalledWith(
      expect.objectContaining({ processoId: "proc-2", conversaId: "conv-nova" }),
    );
  });

  it("cria conversa global quando não vem processoId", async () => {
    mocks.db.conversaAssistente.create.mockResolvedValue({ id: "conv-g", processoId: null });

    await POST(requisicao({ mensagem: "quais processos estão parados?" }));

    expect(mocks.db.conversaAssistente.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processoId: null }) }),
    );
    expect(mocks.montarRegistry).toHaveBeenCalledWith(
      expect.objectContaining({ processoId: null }),
    );
  });
});
