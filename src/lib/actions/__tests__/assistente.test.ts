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
    resultadoSimilaridade: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    // Presentes de propósito: os testes provam que NUNCA são chamados.
    fonte: { create: vi.fn() },
    evidencia: { create: vi.fn() },
    precoConsolidado: { create: vi.fn() },
    seriePreco: { create: vi.fn(), findFirst: vi.fn() },
  },
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
  // Novo fluxo: candidatoEstaNoTempo (recência) e rankearSimilaridade (IA) são
  // separados — permitem controle independente nos testes.
  candidatoEstaNoTempo: vi.fn().mockReturnValue(true),
  rankearSimilaridade: vi.fn(),
  getProvedorIA: vi.fn(),
  revalidatePath: vi.fn(),
  listarItensDaCompraPNCP: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("@/lib/similaridade/filtroRecencia", () => ({
  candidatoEstaNoTempo: mocks.candidatoEstaNoTempo,
  filtrarPorRecencia: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/ia", () => ({ getProvedorIA: mocks.getProvedorIA }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/integracoes/pncp", () => ({
  listarItensDaCompraPNCP: mocks.listarItensDaCompraPNCP,
}));

import {
  adicionarCandidatoSugerido,
  adicionarItemDaContratacao,
  listarOutrosItensDaContratacao,
  obterConversaAtiva,
} from "../assistente";

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
  natureza: null as "bem_consumo" | "servico_continuo" | null,
};

// Resposta que provedor.rankearSimilaridade devolve (antes de recalcular o scoreFinal).
// scoreFinal gravado no banco = calcularScoreFinal({88, 80, 76}) = 88*0.4+80*0.35+76*0.25 = 82.2
const AVALIACAO = {
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
  scoreFinal: 82.5, // valor do provider; o código recalcula via calcularScoreFinal
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
    mocks.db.resultadoSimilaridade.update.mockResolvedValue({ id: "res-1" });
    // Novo fluxo: recência aprovada por padrão; IA retorna avaliação com score alto.
    mocks.candidatoEstaNoTempo.mockReturnValue(true);
    mocks.rankearSimilaridade.mockResolvedValue([AVALIACAO]);
    mocks.getProvedorIA.mockReturnValue({ rankearSimilaridade: mocks.rankearSimilaridade });
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

    // O candidato passado à IA vem da mensagem gravada, não do corpo do request.
    const candidatosEnviados = mocks.rankearSimilaridade.mock.calls[0]![1] as Array<{
      valorUnitario: number;
      fonteOrgaoOuId: string;
    }>;
    expect(candidatosEnviados[0]!.valorUnitario).toBe(850.5);
    expect(candidatosEnviados[0]!.fonteOrgaoOuId).toBe("Prefeitura de Exemplo");

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

  it("usa o score calculado pelo motor de similaridade, não um informado de fora", async () => {
    await adicionarCandidatoSugerido(PEDIDO);

    const gravado = mocks.db.resultadoSimilaridade.create.mock.calls[0]![0].data;
    // scoreFinal é recalculado via calcularScoreFinal: 88*0.4 + 80*0.35 + 76*0.25 = 82.2
    expect(Number(gravado.scoreFinal)).toBeCloseTo(82.2, 1);
    expect(Number(gravado.scoreDescricao)).toBe(88);
    expect(gravado.justificativa).toBe("Mesmo tipo de produto e unidade compatível");
  });

  it("rejeita quando o candidato está fora da janela de recência", async () => {
    mocks.candidatoEstaNoTempo.mockReturnValue(false);

    const r = await adicionarCandidatoSugerido(PEDIDO);

    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/janela|dias/i);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
  });

  it("rejeita quando o score ficou abaixo de 40 mesmo para adição manual", async () => {
    // Score muito baixo: scoreDescricao 20, scoreEspecificacao 10, scoreUnidadeQuantidade 5
    // calcularScoreFinal = 20*0.4 + 10*0.35 + 5*0.25 = 8 + 3.5 + 1.25 = 12.75 < 40
    mocks.rankearSimilaridade.mockResolvedValue([{
      ...AVALIACAO,
      scoreDescricao: 20,
      scoreEspecificacao: 10,
      scoreUnidadeQuantidade: 5,
    }]);

    const r = await adicionarCandidatoSugerido(PEDIDO);

    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/abaixo de 40|score.*abaixo/i);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
  });

  it("passa a natureza cadastrada do item para a checagem de recência, não uma escolha do clique", async () => {
    mocks.db.item.findUnique.mockResolvedValue({ ...ITEM, natureza: "bem_consumo" });

    await adicionarCandidatoSugerido(PEDIDO);

    expect(mocks.candidatoEstaNoTempo).toHaveBeenCalledWith(
      expect.objectContaining({ valorUnitario: 850.5 }),
      "bem_consumo",
    );
  });

  it("rejeita fora da janela do item classificado como bem de consumo (365 dias)", async () => {
    mocks.db.item.findUnique.mockResolvedValue({ ...ITEM, natureza: "bem_consumo" });
    mocks.candidatoEstaNoTempo.mockReturnValue(false);

    const r = await adicionarCandidatoSugerido(PEDIDO);

    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/365 dias|bem de consumo/i);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
  });

  it("não regrava contratação que já está na lista do item", async () => {
    mocks.db.resultadoSimilaridade.findFirst.mockResolvedValue({
      id: "res-existente",
      descartado: false,
    });

    const r = await adicionarCandidatoSugerido(PEDIDO);

    expect(r.ok).toBe(false);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
    expect(mocks.db.resultadoSimilaridade.update).not.toHaveBeenCalled();
  });

  // Descartar grava uma lápide (score 0) com a mesma URL. Tratá-la como
  // duplicata deixava o analista sem saída: ele mandava adicionar de novo,
  // ouvia "já está na lista" e o contrato não aparecia em lugar nenhum.
  it("revive candidato descartado antes, em vez de recusá-lo como duplicata", async () => {
    mocks.db.resultadoSimilaridade.findFirst.mockResolvedValue({
      id: "res-lapide",
      descartado: true,
    });

    const r = await adicionarCandidatoSugerido(PEDIDO);

    expect(r.ok).toBe(true);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
    expect(mocks.db.resultadoSimilaridade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "res-lapide" },
        data: expect.objectContaining({ descartado: false, scoreFinal: expect.any(Number) }),
      }),
    );
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

// ---------------------------------------------------------------------------
// Outros itens da mesma contratação (picker de itens-irmãos)
// ---------------------------------------------------------------------------

const IDENTIDADE = { cnpjOrgao: "123", ano: "2026", numeroSequencial: "4", numeroItem: 1 };

const SUGESTAO_COM_IDENTIDADE = { ...SUGESTAO, identidadeContratacao: IDENTIDADE };

const MENSAGEM_COM_IDENTIDADE = {
  ...MENSAGEM,
  ferramentasUsadas: [
    {
      ferramenta: "buscar_pncp",
      argumentos: "{}",
      resumo: "…",
      duracaoMs: 10,
      sugestoes: [SUGESTAO_COM_IDENTIDADE],
    },
  ],
};

/** Mensagem cujo candidato não tem `identidadeContratacao` NEM `fonteUrl` do PNCP — nada a derivar. */
const MENSAGEM_SEM_IDENTIDADE_NEM_URL = {
  ...MENSAGEM,
  ferramentasUsadas: [
    {
      ferramenta: "buscar_pncp",
      argumentos: "{}",
      resumo: "…",
      duracaoMs: 10,
      sugestoes: [{ ...SUGESTAO, fonteUrl: null }],
    },
  ],
};

/** Item irmão (numeroItem 2) que `listarItensDaCompraPNCP` devolveria da mesma contratação. */
const CANDIDATO_IRMAO = {
  tipoCandidato: "contratacao_publica" as const,
  fonteDescricao: "Cadeira giratória sem apoio lombar",
  fonteOrgaoOuId: "Prefeitura de Exemplo",
  fonteUrl: "https://pncp.gov.br/app/editais/123/2026/4",
  valorUnitario: 700,
  dataReferencia: new Date("2026-05-10"),
  unidade: "unidade",
  quantidade: 30,
  identidadeContratacao: { ...IDENTIDADE, numeroItem: 2 },
};

describe("listarOutrosItensDaContratacao", () => {
  const PEDIDO_LISTAGEM = { mensagemId: "msg-1", candidatoId: "c1" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue(USER);
    mocks.db.mensagemAssistente.findUnique.mockResolvedValue(MENSAGEM_COM_IDENTIDADE);
    mocks.listarItensDaCompraPNCP.mockResolvedValue({
      candidatos: [
        // O próprio item do card volta na listagem crua — precisa ser filtrado.
        { ...CANDIDATO_IRMAO, identidadeContratacao: IDENTIDADE, fonteDescricao: "Cadeira giratória ergonômica" },
        CANDIDATO_IRMAO,
      ],
      completo: true,
    });
  });

  it("exclui da lista o item que já é o próprio card", async () => {
    const r = await listarOutrosItensDaContratacao(PEDIDO_LISTAGEM);

    expect(r.ok).toBe(true);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]!.numeroItem).toBe(2);
  });

  it("recusa candidato sem identidade PNCP estruturada nem fonteUrl para derivar", async () => {
    mocks.db.mensagemAssistente.findUnique.mockResolvedValue(MENSAGEM_SEM_IDENTIDADE_NEM_URL);

    const r = await listarOutrosItensDaContratacao(PEDIDO_LISTAGEM);

    expect(r.ok).toBe(false);
    expect(r.itens).toEqual([]);
    expect(mocks.listarItensDaCompraPNCP).not.toHaveBeenCalled();
  });

  // Candidato gravado ANTES de `identidadeContratacao` existir no schema —
  // precisa continuar funcionando, senão todo card antigo perde o botão.
  it("deriva a identidade do fonteUrl para candidato antigo sem identidadeContratacao", async () => {
    mocks.db.mensagemAssistente.findUnique.mockResolvedValue(MENSAGEM);

    const r = await listarOutrosItensDaContratacao(PEDIDO_LISTAGEM);

    expect(r.ok).toBe(true);
    expect(mocks.listarItensDaCompraPNCP).toHaveBeenCalledWith(
      { cnpjOrgao: "123", ano: "2026", numeroSequencial: "4" },
      "Prefeitura de Exemplo",
    );
    // Sem numeroItem original para comparar, nada é excluído da lista.
    expect(r.itens).toHaveLength(2);
  });

  it("recusa mensagem de outro usuário", async () => {
    mocks.db.mensagemAssistente.findUnique.mockResolvedValue({
      ...MENSAGEM_COM_IDENTIDADE,
      conversa: { ...MENSAGEM_COM_IDENTIDADE.conversa, userId: "outro-usuario" },
    });

    const r = await listarOutrosItensDaContratacao(PEDIDO_LISTAGEM);

    expect(r.ok).toBe(false);
    expect(mocks.listarItensDaCompraPNCP).not.toHaveBeenCalled();
  });

  it("marca truncado quando a busca não pôde consultar a contratação inteira", async () => {
    mocks.listarItensDaCompraPNCP.mockResolvedValue({ candidatos: [], completo: false });

    const r = await listarOutrosItensDaContratacao(PEDIDO_LISTAGEM);

    expect(r.ok).toBe(true);
    expect(r.truncado).toBe(true);
  });

  it("busca a contratação pelo cnpj/ano/sequencial e órgão do candidato original", async () => {
    await listarOutrosItensDaContratacao(PEDIDO_LISTAGEM);

    expect(mocks.listarItensDaCompraPNCP).toHaveBeenCalledWith(IDENTIDADE, "Prefeitura de Exemplo");
  });

  it("exige o papel de pesquisa", async () => {
    await listarOutrosItensDaContratacao(PEDIDO_LISTAGEM);

    expect(mocks.requireRole).toHaveBeenCalledWith("pesquisa");
  });
});

describe("adicionarItemDaContratacao", () => {
  const PEDIDO_IRMAO = { mensagemId: "msg-1", candidatoId: "c1", numeroItem: 2, itemId: "item-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue(USER);
    mocks.db.mensagemAssistente.findUnique.mockResolvedValue(MENSAGEM_COM_IDENTIDADE);
    mocks.db.item.findUnique.mockResolvedValue(ITEM);
    mocks.db.resultadoSimilaridade.findFirst.mockResolvedValue(null);
    mocks.db.resultadoSimilaridade.create.mockResolvedValue({ id: "res-1" });
    mocks.candidatoEstaNoTempo.mockReturnValue(true);
    mocks.rankearSimilaridade.mockResolvedValue([
      { ...AVALIACAO, candidato: { ...AVALIACAO.candidato, valorUnitario: 700 } },
    ]);
    mocks.getProvedorIA.mockReturnValue({ rankearSimilaridade: mocks.rankearSimilaridade });
    mocks.listarItensDaCompraPNCP.mockResolvedValue({ candidatos: [CANDIDATO_IRMAO], completo: true });
  });

  // A garantia central deste caminho: `numeroItem` é só uma chave de busca — o
  // preço vem de uma nova consulta ao PNCP no servidor, nunca de algo que o
  // navegador tenha mandado (não há sequer campo de valor no payload).
  it("busca o preço do item irmão no servidor, a partir só do número do item", async () => {
    await adicionarItemDaContratacao(PEDIDO_IRMAO);

    expect(mocks.listarItensDaCompraPNCP).toHaveBeenCalledWith(IDENTIDADE, "Prefeitura de Exemplo");
    const candidatosEnviados = mocks.rankearSimilaridade.mock.calls[0]![1] as Array<{ valorUnitario: number }>;
    expect(candidatosEnviados[0]!.valorUnitario).toBe(700);
  });

  it("recusa quando o item irmão não tem preço homologado disponível agora", async () => {
    mocks.listarItensDaCompraPNCP.mockResolvedValue({ candidatos: [], completo: true });

    const r = await adicionarItemDaContratacao(PEDIDO_IRMAO);

    expect(r.ok).toBe(false);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
  });

  it("recusa candidato sem identidade PNCP estruturada nem fonteUrl para derivar", async () => {
    mocks.db.mensagemAssistente.findUnique.mockResolvedValue(MENSAGEM_SEM_IDENTIDADE_NEM_URL);

    const r = await adicionarItemDaContratacao(PEDIDO_IRMAO);

    expect(r.ok).toBe(false);
    expect(mocks.listarItensDaCompraPNCP).not.toHaveBeenCalled();
  });

  it("deriva a identidade do fonteUrl para candidato antigo sem identidadeContratacao", async () => {
    mocks.db.mensagemAssistente.findUnique.mockResolvedValue(MENSAGEM);

    const r = await adicionarItemDaContratacao(PEDIDO_IRMAO);

    expect(r.ok).toBe(true);
    expect(mocks.listarItensDaCompraPNCP).toHaveBeenCalledWith(
      { cnpjOrgao: "123", ano: "2026", numeroSequencial: "4" },
      "Prefeitura de Exemplo",
    );
  });

  it("recusa item de outro processo", async () => {
    mocks.db.item.findUnique.mockResolvedValue({ ...ITEM, processoId: "proc-INVASOR" });

    const r = await adicionarItemDaContratacao(PEDIDO_IRMAO);

    expect(r.ok).toBe(false);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
  });

  it("respeita a mesma dedup por item+fonteUrl da adição normal", async () => {
    mocks.db.resultadoSimilaridade.findFirst.mockResolvedValue({ id: "res-existente", descartado: false });

    const r = await adicionarItemDaContratacao(PEDIDO_IRMAO);

    expect(r.ok).toBe(false);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
  });

  it("audita com o número do item irmão distinguível do candidato original", async () => {
    await adicionarItemDaContratacao(PEDIDO_IRMAO);

    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ detalhes: expect.objectContaining({ candidatoId: "c1:2" }) }),
    );
  });

  it("exige o papel de pesquisa", async () => {
    await adicionarItemDaContratacao(PEDIDO_IRMAO);

    expect(mocks.requireRole).toHaveBeenCalledWith("pesquisa");
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
