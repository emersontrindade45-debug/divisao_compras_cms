import { beforeEach, describe, expect, it, vi } from "vitest";

// Aprovação por clique dos candidatos que o assistente encontrou (M13).
//
// Este arquivo herda as invariantes de conformidade que antes moravam nos testes
// de `registrar_candidatos`, em `assistente/ferramentas.test.ts`. A ferramenta de
// escrita foi removida — o assistente só propõe — mas as garantias não sumiram
// com ela: mudaram para cá, do outro lado do clique do servidor. Apagar aqueles
// testes sem trazer isto seria perder cobertura exatamente das regras que
// justificam o módulo.

const mocks = vi.hoisted(() => ({
  db: {
    mensagemAssistente: { findUnique: vi.fn(), findFirst: vi.fn() },
    conversaAssistente: { findFirst: vi.fn() },
    item: { findUnique: vi.fn(), findMany: vi.fn() },
    resultadoSimilaridade: { create: vi.fn(), findFirst: vi.fn() },
    // Presentes de propósito: os testes provam que NUNCA são chamados.
    fonte: { create: vi.fn() },
    evidencia: { create: vi.fn() },
    precoConsolidado: { create: vi.fn() },
    seriePreco: { create: vi.fn(), findFirst: vi.fn() },
  },
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
  rankearCandidatos: vi.fn(),
  getProvedorIA: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("@/lib/similaridade/rankearCandidatos", () => ({
  rankearCandidatos: mocks.rankearCandidatos,
}));
vi.mock("@/lib/ia", () => ({ getProvedorIA: mocks.getProvedorIA }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { adicionarCandidatoSugerido, obterConversaAtiva } from "../assistente";

const USER = { id: "user-1", role: "pesquisa", email: "u@e.com" };

/** Sugestão como fica gravada em `MensagemAssistente.ferramentasUsadas`. */
const SUGESTAO = {
  id: "c1",
  tipoCandidato: "contratacao_publica" as const,
  fonteDescricao: "Cadeira giratória ergonômica",
  fonteOrgaoOuId: "Prefeitura de Exemplo",
  fonteUrl: "https://pncp.gov.br/app/editais/123/2026/4",
  valorUnitario: 850.5,
  dataReferencia: "2026-05-10T00:00:00.000Z",
  unidade: "unidade",
  quantidade: 50,
  itemIdSugerido: "item-1",
  termoBuscaUsado: "cadeira giratória",
};

const MENSAGEM = {
  id: "msg-1",
  ferramentasUsadas: [
    { ferramenta: "buscar_pncp", argumentos: "{}", resumo: "…", duracaoMs: 10, sugestoes: [SUGESTAO] },
  ],
  conversa: { id: "conv-1", userId: "user-1", processoId: "proc-1" },
};

const ITEM = {
  id: "item-1",
  processoId: "proc-1",
  descricao: "Cadeira giratória",
  unidade: "unidade",
  quantidade: 50,
  caracteristicasTecnicas: "com apoio lombar",
};

const RANQUEADO = {
  candidato: {
    tipoCandidato: "contratacao_publica" as const,
    fonteDescricao: "Cadeira giratória ergonômica",
    fonteOrgaoOuId: "Prefeitura de Exemplo",
    fonteUrl: "https://pncp.gov.br/app/editais/123/2026/4",
    valorUnitario: 850.5,
    dataReferencia: new Date("2026-05-10"),
    unidade: "unidade",
    quantidade: 50,
  },
  scoreFinal: 82.5,
  scoreDescricao: 88,
  scoreEspecificacao: 80,
  scoreUnidadeQuantidade: 76,
  adaptado: false,
  justificativa: "Mesmo tipo de produto e unidade compatível",
};

const PEDIDO = { mensagemId: "msg-1", candidatoId: "c1", itemId: "item-1" };

describe("adicionarCandidatoSugerido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(USER);
    mocks.requireRole.mockResolvedValue(USER);
    mocks.db.mensagemAssistente.findUnique.mockResolvedValue(MENSAGEM);
    mocks.db.item.findUnique.mockResolvedValue(ITEM);
    mocks.db.resultadoSimilaridade.findFirst.mockResolvedValue(null);
    mocks.db.resultadoSimilaridade.create.mockResolvedValue({ id: "res-1" });
    mocks.rankearCandidatos.mockResolvedValue([RANQUEADO]);
  });

  // ---------------------------------------------------------------------------
  // A guarda central, agora deslocada: nem o modelo nem o NAVEGADOR fabricam
  // preço. O cliente manda três identificadores; o valor vem da mensagem.
  // ---------------------------------------------------------------------------

  it("lê valor, órgão e data da mensagem gravada, não do que o cliente mandou", async () => {
    await adicionarCandidatoSugerido({
      ...PEDIDO,
      // Campos extras que um cliente forjado tentaria injetar. O schema os
      // descarta e eles nunca chegam perto do banco.
      valorUnitario: 1,
      fonteOrgaoOuId: "Órgão Inventado",
    } as unknown as typeof PEDIDO);

    const enviado = mocks.rankearCandidatos.mock.calls[0]![1] as Array<{
      valorUnitario: number;
      fonteOrgaoOuId: string;
    }>;
    expect(enviado[0]!.valorUnitario).toBe(850.5);
    expect(enviado[0]!.fonteOrgaoOuId).toBe("Prefeitura de Exemplo");

    const gravado = mocks.db.resultadoSimilaridade.create.mock.calls[0]![0].data;
    expect(Number(gravado.valorUnitario)).toBe(850.5);
    expect(gravado.fonteOrgaoOuId).toBe("Prefeitura de Exemplo");
  });

  it("recusa candidato que nenhuma busca desta mensagem produziu", async () => {
    const r = await adicionarCandidatoSugerido({ ...PEDIDO, candidatoId: "c99" });

    expect(r.ok).toBe(false);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
  });

  it("recusa mensagem de outro usuário", async () => {
    mocks.db.mensagemAssistente.findUnique.mockResolvedValue({
      ...MENSAGEM,
      conversa: { ...MENSAGEM.conversa, userId: "outro-usuario" },
    });

    const r = await adicionarCandidatoSugerido(PEDIDO);

    expect(r.ok).toBe(false);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
  });

  it("recusa item de outro processo", async () => {
    mocks.db.item.findUnique.mockResolvedValue({ ...ITEM, processoId: "proc-INVASOR" });

    const r = await adicionarCandidatoSugerido(PEDIDO);

    expect(r.ok).toBe(false);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
  });

  it("usa o score do motor de similaridade, não um informado de fora", async () => {
    await adicionarCandidatoSugerido(PEDIDO);

    const gravado = mocks.db.resultadoSimilaridade.create.mock.calls[0]![0].data;
    expect(Number(gravado.scoreFinal)).toBe(82.5);
    expect(Number(gravado.scoreDescricao)).toBe(88);
    expect(gravado.justificativa).toBe("Mesmo tipo de produto e unidade compatível");
  });

  it("não grava nada quando o motor de similaridade reprova o candidato", async () => {
    mocks.rankearCandidatos.mockResolvedValue([]);

    const r = await adicionarCandidatoSugerido(PEDIDO);

    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/365 dias|abaixo do mínimo/i);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
  });

  it("não regrava contratação que já está na lista do item", async () => {
    mocks.db.resultadoSimilaridade.findFirst.mockResolvedValue({ id: "res-existente" });

    const r = await adicionarCandidatoSugerido(PEDIDO);

    expect(r.ok).toBe(false);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
  });

  it("marca origem, conversa e termo usado no candidato gravado", async () => {
    await adicionarCandidatoSugerido(PEDIDO);

    const gravado = mocks.db.resultadoSimilaridade.create.mock.calls[0]![0].data;
    expect(gravado.origem).toBe("assistente");
    expect(gravado.conversaId).toBe("conv-1");
    expect(gravado.termoBuscaUsado).toBe("cadeira giratória");
  });

  it("audita a aprovação com o processo do item e quem clicou", async () => {
    await adicionarCandidatoSugerido(PEDIDO);

    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        processoId: "proc-1",
        acao: "assistente_adicionar_candidato",
      }),
    );
  });

  // Sem isto o candidato entra no banco e a tabela ao lado do chat continua a
  // mesma até alguém recarregar a página — que foi o defeito relatado.
  it("revalida a página do processo para a tabela atualizar na hora", async () => {
    await adicionarCandidatoSugerido(PEDIDO);

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/processos/proc-1");
  });

  it("exige o papel de pesquisa, como a promoção a fonte", async () => {
    await adicionarCandidatoSugerido(PEDIDO);

    expect(mocks.requireRole).toHaveBeenCalledWith("pesquisa");
  });

  // Herdado de `ferramentas.test.ts`: o assistente cria CANDIDATO, nunca fonte
  // da estimativa. Varre a superfície inteira de escrita em vez de conferir uma
  // lista de nomes lembrada na hora (CLAUDE.md §9.56) — model novo no schema
  // nasce coberto.
  it("nunca cria Fonte, Evidencia, SeriePreco nem PrecoConsolidado", async () => {
    await adicionarCandidatoSugerido(PEDIDO);

    const escritas = ["create", "createMany", "update", "updateMany", "upsert", "delete"];
    const proibidos = Object.entries(mocks.db).filter(
      ([model]) => model !== "resultadoSimilaridade",
    );

    const violacoes: string[] = [];
    for (const [model, metodos] of proibidos) {
      for (const [metodo, fn] of Object.entries(metodos as Record<string, { mock?: { calls: unknown[] } }>)) {
        if (escritas.includes(metodo) && (fn.mock?.calls.length ?? 0) > 0) {
          violacoes.push(`${model}.${metodo}`);
        }
      }
    }
    expect(violacoes).toEqual([]);
  });
});

describe("obterConversaAtiva", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(USER);
  });

  it("devolve null quando o usuário ainda não conversou neste escopo", async () => {
    mocks.db.mensagemAssistente.findFirst.mockResolvedValue(null);

    expect(await obterConversaAtiva("proc-1")).toBeNull();
    expect(mocks.db.conversaAssistente.findFirst).not.toHaveBeenCalled();
  });

  // A conversa é do usuário que a criou: sem o filtro, bastaria estar
  // autenticado para ler a pesquisa de outro servidor.
  it("filtra pelo usuário e pelo escopo ao procurar a última conversa", async () => {
    mocks.db.mensagemAssistente.findFirst.mockResolvedValue({ conversaId: "conv-1" });
    mocks.db.conversaAssistente.findFirst.mockResolvedValue({ id: "conv-1", mensagens: [] });

    await obterConversaAtiva("proc-1");

    const consulta = mocks.db.mensagemAssistente.findFirst.mock.calls[0]![0] as {
      where: { conversa: { userId: string; processoId: string | null } };
      orderBy: { createdAt: string };
    };
    expect(consulta.where.conversa).toEqual({ userId: "user-1", processoId: "proc-1" });
    // A "última conversa" é a que recebeu a última mensagem.
    expect(consulta.orderBy).toEqual({ createdAt: "desc" });
  });

  it("devolve as mensagens em ordem cronológica, do começo para o fim", async () => {
    mocks.db.mensagemAssistente.findFirst.mockResolvedValue({ conversaId: "conv-1" });
    mocks.db.conversaAssistente.findFirst.mockResolvedValue({
      id: "conv-1",
      // Como vêm do banco: mais nova primeiro.
      mensagens: [
        { id: "m2", papel: "assistant", conteudo: "achei 5", ferramentasUsadas: null, citacoes: null },
        { id: "m1", papel: "user", conteudo: "procure brises", ferramentasUsadas: null, citacoes: null },
      ],
    });

    const conversa = await obterConversaAtiva("proc-1");

    expect(conversa!.mensagens.map((m) => m.conteudo)).toEqual([
      "procure brises",
      "achei 5",
    ]);
  });

  it("devolve as sugestões gravadas, para uma busca antiga continuar aprovável", async () => {
    mocks.db.mensagemAssistente.findFirst.mockResolvedValue({ conversaId: "conv-1" });
    mocks.db.conversaAssistente.findFirst.mockResolvedValue({
      id: "conv-1",
      mensagens: [
        {
          id: "m1",
          papel: "assistant",
          conteudo: "achei",
          ferramentasUsadas: MENSAGEM.ferramentasUsadas,
          citacoes: null,
        },
      ],
    });

    const conversa = await obterConversaAtiva("proc-1");

    expect(conversa!.mensagens[0]!.passos[0]!.sugestoes).toHaveLength(1);
    expect(conversa!.mensagens[0]!.passos[0]!.sugestoes![0]!.valorUnitario).toBe(850.5);
  });

  // O campo é `Json` gravado por versões anteriores do código: um formato
  // inesperado precisa degradar (mensagem sem rastro) e não derrubar a tela.
  it("tolera rastro de ferramentas em formato desconhecido", async () => {
    mocks.db.mensagemAssistente.findFirst.mockResolvedValue({ conversaId: "conv-1" });
    mocks.db.conversaAssistente.findFirst.mockResolvedValue({
      id: "conv-1",
      mensagens: [
        {
          id: "m1",
          papel: "assistant",
          conteudo: "oi",
          ferramentasUsadas: { formato: "antigo" },
          citacoes: "nao é lista",
        },
      ],
    });

    const conversa = await obterConversaAtiva("proc-1");

    expect(conversa!.mensagens[0]!.passos).toEqual([]);
    expect(conversa!.mensagens[0]!.citacoes).toEqual([]);
  });
});
