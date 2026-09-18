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
    mensagemAssistente: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    conversaAssistente: { findFirst: vi.fn(), findMany: vi.fn() },
    item: { findUnique: vi.fn(), findMany: vi.fn() },
    resultadoSimilaridade: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
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
  resolverUrlsAcompanhamentoPainel: vi.fn(),
  resolverUrlPublicaPorIdCompra: vi.fn(),
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
vi.mock("@/lib/integracoes/comprasGov", () => ({
  resolverUrlsAcompanhamentoPainel: mocks.resolverUrlsAcompanhamentoPainel,
  resolverUrlPublicaPorIdCompra: mocks.resolverUrlPublicaPorIdCompra,
}));

import {
  adicionarCandidatoSugerido,
  adicionarItemDaContratacao,
  completarLinksOrigemCandidatos,
  descartarCandidatoAssistente,
  listarConversas,
  listarOutrosItensDaContratacao,
  obterConversa,
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
    mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([]);
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

  it("não regrava o mesmo item da contratação que já está na lista", async () => {
    mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([
      { id: "res-existente", descartado: false, fonteDescricao: "Cadeira giratória ergonômica" },
    ]);

    const r = await adicionarCandidatoSugerido(PEDIDO);

    expect(r.ok).toBe(false);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
    expect(mocks.db.resultadoSimilaridade.update).not.toHaveBeenCalled();
  });

  // Descartar grava uma lápide (score 0) com a mesma URL. Tratá-la como
  // duplicata deixava o analista sem saída: ele mandava adicionar de novo,
  // ouvia "já está na lista" e o contrato não aparecia em lugar nenhum.
  it("revive candidato descartado antes, em vez de recusá-lo como duplicata", async () => {
    mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([
      { id: "res-lapide", descartado: true, fonteDescricao: "Cadeira giratória ergonômica" },
    ]);

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
    mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([]);
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

  // Este teste já existiu afirmando o contrário ("respeita a mesma dedup por
  // item+fonteUrl"), e com isso protegia o defeito: como todos os itens de uma
  // compra do PNCP dividem a URL do edital, qualquer irmão adicionado depois do
  // primeiro era recusado com "já está na lista" — o picker de itens-irmãos
  // ficava inutilizável a partir do segundo clique (CLAUDE.md §9.100).
  it("aceita item irmão do mesmo edital, que divide a fonteUrl do candidato já na lista", async () => {
    mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([
      { id: "res-existente", descartado: false, fonteDescricao: "Cadeira giratória ergonômica" },
    ]);

    const r = await adicionarItemDaContratacao(PEDIDO_IRMAO);

    expect(r.ok).toBe(true);
    expect(mocks.db.resultadoSimilaridade.create).toHaveBeenCalled();
  });

  it("recusa o MESMO item irmão adicionado duas vezes", async () => {
    mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([
      { id: "res-irmao", descartado: false, fonteDescricao: "Cadeira giratória sem apoio lombar" },
    ]);

    const r = await adicionarItemDaContratacao(PEDIDO_IRMAO);

    expect(r.ok).toBe(false);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
  });

  // A lápide a reviver é a do MESMO item. Com a URL sozinha como chave, o
  // descarte do item A seria sobrescrito ao adicionar o item B do mesmo edital.
  it("não revive a lápide de um irmão diferente ao adicionar este item", async () => {
    mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([
      { id: "res-lapide-do-A", descartado: true, fonteDescricao: "Cadeira giratória ergonômica" },
    ]);

    const r = await adicionarItemDaContratacao(PEDIDO_IRMAO);

    expect(r.ok).toBe(true);
    expect(mocks.db.resultadoSimilaridade.update).not.toHaveBeenCalled();
    expect(mocks.db.resultadoSimilaridade.create).toHaveBeenCalled();
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

describe("completarLinksOrigemCandidatos", () => {
  const URL_COMPRA =
    "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=16032805900082024";

  const SUGESTAO_PAINEL = {
    id: "c9",
    tipoCandidato: "contratacao_publica" as const,
    fonteDescricao:
      "PRESTACAO DE SERVICO DE LIMPEZA E CONSERVACAO - AREAS  INTERNAS - 44 HORAS SEMANAIS DIURNAS - PRODUTIVIDADE 600 M2",
    fonteOrgaoOuId: "COMANDO DO EXERCITO",
    fonteUrl: null as string | null,
    valorUnitario: 52147,
    dataReferencia: "2025-07-09T00:00:00.000Z",
    unidade: "M2",
    quantidade: 7,
    itemIdSugerido: "0908/2022",
    termoBuscaUsado: "limpeza conservação predial m²",
    identidadeContratacao: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(USER);
    mocks.db.mensagemAssistente.findUnique.mockResolvedValue({
      id: "msg-1",
      ferramentasUsadas: [
        { ferramenta: "buscar_pncp", argumentos: "{}", sugestoes: [{ ...SUGESTAO_PAINEL }] },
      ],
      conversa: { id: "conv-1", userId: "user-1", processoId: "proc-1" },
    });
    mocks.resolverUrlsAcompanhamentoPainel.mockResolvedValue([URL_COMPRA]);
    mocks.db.mensagemAssistente.update.mockResolvedValue({ id: "msg-1" });
  });

  it("grava a URL do acompanhamento da compra, não a home do Lite", async () => {
    const resultado = await completarLinksOrigemCandidatos({ mensagemId: "msg-1" });

    expect(resultado).toEqual({ ok: true, urls: { c9: URL_COMPRA } });
    expect(mocks.resolverUrlsAcompanhamentoPainel).toHaveBeenCalledWith([
      expect.objectContaining({
        fonteOrgaoOuId: "COMANDO DO EXERCITO",
        valorUnitario: 52147,
      }),
    ]);
    const gravado = mocks.db.mensagemAssistente.update.mock.calls[0]![0].data
      .ferramentasUsadas as Array<{ sugestoes: Array<{ fonteUrl: string; tipoCandidato: string }> }>;
    expect(gravado[0]!.sugestoes[0]!.fonteUrl).toBe(URL_COMPRA);
    expect(gravado[0]!.sugestoes[0]!.tipoCandidato).toBe("painel_precos");
    expect(JSON.stringify(gravado)).not.toContain("pesquisaprecos.compras.gov.br");
  });

  it("não consulta a API quando o card já tem a URL da contratação", async () => {
    mocks.db.mensagemAssistente.findUnique.mockResolvedValue({
      id: "msg-1",
      ferramentasUsadas: [
        { ferramenta: "buscar_pncp", argumentos: "{}", sugestoes: [SUGESTAO] },
      ],
      conversa: { id: "conv-1", userId: "user-1", processoId: "proc-1" },
    });

    const resultado = await completarLinksOrigemCandidatos({ mensagemId: "msg-1" });

    expect(resultado.urls.c1).toBe(SUGESTAO.fonteUrl);
    expect(mocks.resolverUrlsAcompanhamentoPainel).not.toHaveBeenCalled();
    expect(mocks.db.mensagemAssistente.update).not.toHaveBeenCalled();
  });

  it("troca acompanhamento morto pelo edital do PNCP quando a fase externa não acha a compra", async () => {
    const urlMorta =
      "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=92715206000082025";
    const urlPncp = "https://pncp.gov.br/app/editais/11308894000106/2025/87";
    mocks.db.mensagemAssistente.findUnique.mockResolvedValue({
      id: "msg-1",
      ferramentasUsadas: [
        {
          ferramenta: "buscar_pncp",
          argumentos: "{}",
          sugestoes: [{ ...SUGESTAO_PAINEL, id: "c2", fonteUrl: urlMorta }],
        },
      ],
      conversa: { id: "conv-1", userId: "user-1", processoId: "proc-1" },
    });
    mocks.resolverUrlPublicaPorIdCompra.mockResolvedValue(urlPncp);

    const resultado = await completarLinksOrigemCandidatos({ mensagemId: "msg-1" });

    expect(resultado.urls.c2).toBe(urlPncp);
    expect(mocks.resolverUrlPublicaPorIdCompra).toHaveBeenCalledWith("92715206000082025");
    expect(mocks.resolverUrlsAcompanhamentoPainel).not.toHaveBeenCalled();
    const gravado = mocks.db.mensagemAssistente.update.mock.calls[0]![0].data
      .ferramentasUsadas as Array<{ sugestoes: Array<{ fonteUrl: string }> }>;
    expect(gravado[0]!.sugestoes[0]!.fonteUrl).toBe(urlPncp);
  });
});

// ---------------------------------------------------------------------------
// Descarte — mesma chave da adição (item da contratação, não o edital inteiro)
// ---------------------------------------------------------------------------

describe("descartarCandidatoAssistente", () => {
  const PEDIDO_DESCARTE = { mensagemId: "msg-1", candidatoId: "c1", itemId: "item-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue(USER);
    mocks.db.mensagemAssistente.findUnique.mockResolvedValue(MENSAGEM);
    mocks.db.item.findUnique.mockResolvedValue(ITEM);
    mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([]);
    mocks.db.resultadoSimilaridade.create.mockResolvedValue({ id: "res-1" });
  });

  it("grava a lápide do descarte quando este item da contratação ainda não está registrado", async () => {
    const r = await descartarCandidatoAssistente(PEDIDO_DESCARTE);

    expect(r.ok).toBe(true);
    const gravado = mocks.db.resultadoSimilaridade.create.mock.calls[0]![0].data;
    expect(gravado.descartado).toBe(true);
  });

  // Com a URL do edital sozinha como chave, ter um irmão registrado fazia o
  // descarte responder "já registrado" sem gravar nada: o clique se perdia e a
  // mesma descrição voltava na busca seguinte.
  it("grava o descarte mesmo com outro item do MESMO edital já registrado", async () => {
    mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([
      { id: "res-irmao", fonteDescricao: "Cadeira giratória sem apoio lombar" },
    ]);

    const r = await descartarCandidatoAssistente(PEDIDO_DESCARTE);

    expect(r.ok).toBe(true);
    expect(mocks.db.resultadoSimilaridade.create).toHaveBeenCalled();
  });

  it("não duplica a lápide do mesmo item da contratação", async () => {
    mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([
      { id: "res-mesmo", fonteDescricao: "Cadeira giratória ergonômica" },
    ]);

    const r = await descartarCandidatoAssistente(PEDIDO_DESCARTE);

    expect(r.ok).toBe(true);
    expect(mocks.db.resultadoSimilaridade.create).not.toHaveBeenCalled();
  });
});

// Histórico de conversas: antes de existir, `obterConversaAtiva` era a única
// porta de entrada e alcançava só a ÚLTIMA conversa do escopo. Cada clique em
// "Nova conversa" empurrava a anterior para fora da tela, ainda gravada e
// inalcançável — junto com os cartões de candidato, que são a única porta para
// o picker de "outros itens desta licitação". Relatado pelo usuário em
// 2026-09-18, com uma conversa de 60 mensagens escondida por outra de 3.
describe("listarConversas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(USER);
  });

  function conversaDe(
    id: string,
    ultimaMensagem: string | null,
    total: number,
    titulo = `titulo ${id}`,
  ) {
    return {
      id,
      titulo,
      mensagens: ultimaMensagem ? [{ createdAt: new Date(ultimaMensagem) }] : [],
      _count: { mensagens: total },
    };
  }

  // O critério é a última MENSAGEM, não a criação: a conversa antiga que o
  // analista retomou hoje tem de voltar ao topo. Ordenar por `updatedAt` da
  // conversa não serve — escrever mensagem não o toca (a escrita é na filha).
  it("ordena pela última mensagem, não pela ordem que o banco devolveu", async () => {
    mocks.db.conversaAssistente.findMany.mockResolvedValue([
      conversaDe("nova-mas-parada", "2026-09-01T10:00:00Z", 3),
      conversaDe("antiga-retomada", "2026-09-18T12:21:00Z", 60),
      conversaDe("do-meio", "2026-09-10T08:00:00Z", 12),
    ]);

    const lista = await listarConversas("proc-1");

    expect(lista.map((c) => c.id)).toEqual(["antiga-retomada", "do-meio", "nova-mas-parada"]);
    expect(lista[0]).toMatchObject({ totalMensagens: 60 });
  });

  // Cortar antes de ordenar é o defeito da §9.91. O `take` do banco precisa de
  // um `orderBy` próprio, senão pega 50 linhas em ordem indefinida.
  it("pede ao banco um recorte ordenado e só do usuário e do escopo", async () => {
    mocks.db.conversaAssistente.findMany.mockResolvedValue([]);

    await listarConversas("proc-1");

    const args = mocks.db.conversaAssistente.findMany.mock.calls[0]![0];
    expect(args.where).toMatchObject({ userId: "user-1", processoId: "proc-1" });
    // Conversa sem mensagem nenhuma não vira linha vazia na lista.
    expect(args.where.mensagens).toEqual({ some: {} });
    expect(args.orderBy).toBeDefined();
    expect(args.take).toBeGreaterThan(0);
  });

  // `processoId: null` é o escopo global (atalho da Topbar) e NÃO pode virar
  // "qualquer processo": traria para a lista geral conversas de processos.
  it("trata a ausência de processo como escopo global, não como filtro aberto", async () => {
    mocks.db.conversaAssistente.findMany.mockResolvedValue([]);

    await listarConversas(null);

    expect(mocks.db.conversaAssistente.findMany.mock.calls[0]![0].where).toMatchObject({
      processoId: null,
    });
  });
});

describe("obterConversa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(USER);
  });

  // O id vem do navegador. Sem `userId` no `where`, bastaria trocá-lo para ler
  // a conversa de outro usuário — e conversa carrega preço, fornecedor e o
  // rastro da pesquisa.
  it("filtra por userId no banco, não só depois de ler", async () => {
    mocks.db.conversaAssistente.findFirst.mockResolvedValue(null);

    await obterConversa({ conversaId: "conv-de-outro" });

    expect(mocks.db.conversaAssistente.findFirst.mock.calls[0]![0].where).toEqual({
      id: "conv-de-outro",
      userId: "user-1",
    });
  });

  it("devolve as mensagens na ordem de leitura, da mais antiga para a mais nova", async () => {
    // O banco devolve `desc` (é assim que se pegam as ÚLTIMAS N); a tela lê de
    // cima para baixo.
    mocks.db.conversaAssistente.findFirst.mockResolvedValue({
      id: "conv-1",
      mensagens: [
        { id: "m3", papel: "assistant", conteudo: "terceira", ferramentasUsadas: null, citacoes: null },
        { id: "m2", papel: "user", conteudo: "segunda", ferramentasUsadas: null, citacoes: null },
        { id: "m1", papel: "user", conteudo: "primeira", ferramentasUsadas: null, citacoes: null },
      ],
    });

    const conversa = await obterConversa({ conversaId: "conv-1" });

    expect(conversa?.conversaId).toBe("conv-1");
    expect(conversa?.mensagens.map((m) => m.conteudo)).toEqual(["primeira", "segunda", "terceira"]);
  });

  it("devolve null quando a conversa não é do usuário", async () => {
    mocks.db.conversaAssistente.findFirst.mockResolvedValue(null);

    expect(await obterConversa({ conversaId: "conv-de-outro" })).toBeNull();
  });
});

// Paginação para trás da conversa.
//
// Sem ela, reabrir uma conversa longa mostrava só o fim: medido em produção em
// 2026-09-18, os cartões da contratação de Ferraz de Vasconcelos estavam nas
// mensagens 6, 10 e 12 de 60 — fora da janela, e com eles o picker de "outros
// itens desta licitação", que era o que o analista precisava.
describe("obterConversa — carregar mensagens anteriores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(USER);
  });

  function mensagensDe(quantidade: number) {
    return Array.from({ length: quantidade }, (_, i) => ({
      id: `m${i}`,
      papel: "user",
      conteudo: `msg ${i}`,
      ferramentasUsadas: null,
      citacoes: null,
    }));
  }

  // O "+1" é como se sabe que há página anterior sem contar a conversa inteira.
  // O extra não pode vazar para a tela.
  it("sinaliza temMais sem devolver a mensagem extra usada para detectá-lo", async () => {
    mocks.db.conversaAssistente.findFirst.mockResolvedValue({
      id: "conv-1",
      mensagens: mensagensDe(31),
    });

    const conversa = await obterConversa({ conversaId: "conv-1" });

    expect(conversa?.temMais).toBe(true);
    expect(conversa?.mensagens).toHaveLength(30);
    expect(mocks.db.conversaAssistente.findFirst.mock.calls[0]![0].select.mensagens.take).toBe(31);
  });

  it("não promete página anterior quando a conversa cabe inteira", async () => {
    mocks.db.conversaAssistente.findFirst.mockResolvedValue({
      id: "conv-1",
      mensagens: mensagensDe(12),
    });

    const conversa = await obterConversa({ conversaId: "conv-1" });

    expect(conversa?.temMais).toBe(false);
    expect(conversa?.mensagens).toHaveLength(12);
  });

  // A asserção decisiva é no filtro que vai ao banco, não no resultado: com o
  // Prisma mockado o retorno é o que o teste mandou, então só o argumento prova
  // que o cursor foi aplicado (§9.99).
  it("filtra pelas mensagens ANTERIORES ao cursor, com desempate por id", async () => {
    const corte = new Date("2026-09-18T12:00:00Z");
    mocks.db.mensagemAssistente.findFirst.mockResolvedValue({ createdAt: corte, id: "m30" });
    mocks.db.conversaAssistente.findFirst.mockResolvedValue({ id: "conv-1", mensagens: [] });

    await obterConversa({ conversaId: "conv-1", antesDe: "m30" });

    const where = mocks.db.conversaAssistente.findFirst.mock.calls[0]![0].select.mensagens.where;
    expect(where.OR).toEqual([
      { createdAt: { lt: corte } },
      { createdAt: corte, id: { lt: "m30" } },
    ]);
  });

  // Cursor de outra conversa não pode cair em "primeira página": devolveria o
  // FIM da conversa de novo, duplicando o que já está na tela.
  it("recusa cursor que não pertence à conversa do usuário", async () => {
    mocks.db.mensagemAssistente.findFirst.mockResolvedValue(null);

    expect(await obterConversa({ conversaId: "conv-1", antesDe: "m-de-outra" })).toBeNull();
    expect(mocks.db.conversaAssistente.findFirst).not.toHaveBeenCalled();
  });

  // O cursor é buscado com o dono no filtro, não conferido depois.
  it("busca o cursor amarrado à conversa e ao usuário", async () => {
    mocks.db.mensagemAssistente.findFirst.mockResolvedValue(null);

    await obterConversa({ conversaId: "conv-1", antesDe: "m30" });

    expect(mocks.db.mensagemAssistente.findFirst.mock.calls[0]![0].where).toEqual({
      id: "m30",
      conversa: { id: "conv-1", userId: "user-1" },
    });
  });

  it("sem cursor não filtra por data — carrega a página mais recente", async () => {
    mocks.db.conversaAssistente.findFirst.mockResolvedValue({ id: "conv-1", mensagens: [] });

    await obterConversa({ conversaId: "conv-1" });

    const where = mocks.db.conversaAssistente.findFirst.mock.calls[0]![0].select.mensagens.where;
    expect(where.OR).toBeUndefined();
    expect(mocks.db.mensagemAssistente.findFirst).not.toHaveBeenCalled();
  });
});
