import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    site: { findMany: vi.fn() },
    processo: { findUnique: vi.fn(), findMany: vi.fn() },
    item: { findMany: vi.fn(), findUnique: vi.fn() },
    resultadoSimilaridade: { findMany: vi.fn(), createMany: vi.fn() },
    // Presentes de propósito: os testes provam que NUNCA são chamados.
    fonte: { create: vi.fn() },
    evidencia: { create: vi.fn() },
    precoConsolidado: { create: vi.fn() },
    seriePreco: { create: vi.fn(), findFirst: vi.fn() },
  },
  registrarAuditoria: vi.fn(),
  buscarContratosPNCP: vi.fn(),
  buscarWebPerplexity: vi.fn(),
  perplexityConfigurada: vi.fn(),
  rankearCandidatos: vi.fn(),
  getProvedorIA: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("@/lib/integracoes/pncp", () => ({ buscarContratosPNCP: mocks.buscarContratosPNCP }));
vi.mock("@/lib/integracoes/perplexity", () => ({
  buscarWebPerplexity: mocks.buscarWebPerplexity,
  perplexityConfigurada: mocks.perplexityConfigurada,
}));
vi.mock("@/lib/similaridade/rankearCandidatos", () => ({
  rankearCandidatos: mocks.rankearCandidatos,
}));
vi.mock("@/lib/ia", () => ({ getProvedorIA: mocks.getProvedorIA }));

import { montarRegistry, type ContextoFerramentas } from "../ferramentas";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

const CTX_PROCESSO: ContextoFerramentas = {
  userId: "user-1",
  processoId: "proc-1",
  conversaId: "conv-1",
};

const CTX_GLOBAL: ContextoFerramentas = {
  userId: "user-1",
  processoId: null,
  conversaId: "conv-1",
};

function candidato(overrides: Partial<CandidatoSimilaridade> = {}): CandidatoSimilaridade {
  return {
    tipoCandidato: "contratacao_publica",
    fonteDescricao: "Cadeira giratória ergonômica",
    fonteOrgaoOuId: "Prefeitura de Exemplo",
    fonteUrl: "https://pncp.gov.br/app/contrato/123",
    valorUnitario: 850.5,
    dataReferencia: new Date("2026-05-10"),
    unidade: "unidade",
    quantidade: 50,
    ...overrides,
  };
}

/** Chama uma ferramenta e devolve o JSON já desserializado. */
async function chamar(
  registry: ReturnType<typeof montarRegistry>,
  nome: string,
  args: unknown,
): Promise<Record<string, unknown>> {
  const resultado = await registry.executar({
    id: "call-1",
    nome,
    argumentos: typeof args === "string" ? args : JSON.stringify(args),
  });
  return JSON.parse(resultado.conteudo) as Record<string, unknown>;
}

const ITEM = {
  id: "item-1",
  processoId: "proc-1",
  descricao: "Cadeira giratória",
  unidade: "unidade",
  quantidade: 50,
  caracteristicasTecnicas: "com apoio lombar",
};

const RANQUEADO = {
  candidato: candidato(),
  scoreFinal: 82.5,
  scoreDescricao: 88,
  scoreEspecificacao: 80,
  scoreUnidadeQuantidade: 76,
  adaptado: false,
  justificativa: "Mesmo tipo de produto e unidade compatível",
};

describe("registry de ferramentas do assistente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.perplexityConfigurada.mockReturnValue(true);
    mocks.db.site.findMany.mockResolvedValue([]);
    mocks.db.item.findUnique.mockResolvedValue(ITEM);
    mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([]);
    mocks.db.resultadoSimilaridade.createMany.mockResolvedValue({ count: 1 });
    mocks.buscarContratosPNCP.mockResolvedValue([candidato()]);
    mocks.rankearCandidatos.mockResolvedValue([RANQUEADO]);
  });

  // -------------------------------------------------------------------------
  // A guarda central: o modelo não pode fabricar um preço.
  // -------------------------------------------------------------------------

  describe("registrar_candidatos — origem dos dados de preço", () => {
    it("recusa ids que nenhuma busca desta conversa devolveu", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "registrar_candidatos", {
        itemId: "item-1",
        candidatoIds: ["c1"],
        termoBuscaUsado: "cadeira",
      });

      expect(resposta.erro).toMatch(/não reconhecidos/i);
      expect(mocks.db.resultadoSimilaridade.createMany).not.toHaveBeenCalled();
    });

    it("aceita apenas ids catalogados por uma busca anterior no mesmo registry", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const busca = await chamar(registry, "buscar_pncp", { termo: "cadeira giratória" });
      const candidatos = busca.candidatos as Array<{ id: string }>;
      expect(candidatos).toHaveLength(1);

      const resposta = await chamar(registry, "registrar_candidatos", {
        itemId: "item-1",
        candidatoIds: [candidatos[0]!.id],
        termoBuscaUsado: "cadeira giratória",
      });

      expect(resposta.erro).toBeUndefined();
      expect(resposta.registrados).toBe(1);
    });

    it("um registry não enxerga o catálogo de outro (não vaza entre conversas)", async () => {
      const primeiro = montarRegistry(CTX_PROCESSO);
      const busca = await chamar(primeiro, "buscar_pncp", { termo: "cadeira" });
      const id = (busca.candidatos as Array<{ id: string }>)[0]!.id;

      const segundo = montarRegistry({ ...CTX_PROCESSO, conversaId: "conv-2" });
      const resposta = await chamar(segundo, "registrar_candidatos", {
        itemId: "item-1",
        candidatoIds: [id],
        termoBuscaUsado: "cadeira",
      });

      expect(resposta.erro).toMatch(/não reconhecidos/i);
      expect(mocks.db.resultadoSimilaridade.createMany).not.toHaveBeenCalled();
    });

    it("persiste valor, órgão e data vindos da busca, não do que o modelo mandou", async () => {
      const registry = montarRegistry(CTX_PROCESSO);
      const busca = await chamar(registry, "buscar_pncp", { termo: "cadeira" });
      const id = (busca.candidatos as Array<{ id: string }>)[0]!.id;

      await chamar(registry, "registrar_candidatos", {
        itemId: "item-1",
        candidatoIds: [id],
        termoBuscaUsado: "cadeira",
        // Campos que o modelo poderia tentar contrabandear: o schema os ignora.
        valorUnitario: 99999,
        fonteOrgaoOuId: "Órgão Inventado",
      });

      const gravado = mocks.db.resultadoSimilaridade.createMany.mock.calls[0]![0].data[0];
      expect(gravado.valorUnitario).toBe(850.5);
      expect(gravado.fonteOrgaoOuId).toBe("Prefeitura de Exemplo");
      expect(gravado.dataReferencia).toEqual(new Date("2026-05-10"));
    });

    it("usa o score do motor de similaridade, não um score informado pelo modelo", async () => {
      const registry = montarRegistry(CTX_PROCESSO);
      const busca = await chamar(registry, "buscar_pncp", { termo: "cadeira" });
      const id = (busca.candidatos as Array<{ id: string }>)[0]!.id;

      await chamar(registry, "registrar_candidatos", {
        itemId: "item-1",
        candidatoIds: [id],
        termoBuscaUsado: "cadeira",
        scoreFinal: 100,
      });

      expect(mocks.rankearCandidatos).toHaveBeenCalledTimes(1);
      const gravado = mocks.db.resultadoSimilaridade.createMany.mock.calls[0]![0].data[0];
      expect(gravado.scoreFinal).toBe(82.5);
      expect(gravado.scoreDescricao).toBe(88);
    });

    it("não grava nada quando o motor de similaridade reprova todos os candidatos", async () => {
      // É o caminho do filtro de recência da IN 65 e do corte por score mínimo:
      // `rankearCandidatos` devolve vazio e nada pode ser persistido.
      mocks.rankearCandidatos.mockResolvedValue([]);
      const registry = montarRegistry(CTX_PROCESSO);
      const busca = await chamar(registry, "buscar_pncp", { termo: "cadeira" });
      const id = (busca.candidatos as Array<{ id: string }>)[0]!.id;

      const resposta = await chamar(registry, "registrar_candidatos", {
        itemId: "item-1",
        candidatoIds: [id],
        termoBuscaUsado: "cadeira",
      });

      expect(resposta.registrados).toBe(0);
      expect(resposta.motivo).toMatch(/365 dias|abaixo do mínimo/i);
      expect(mocks.db.resultadoSimilaridade.createMany).not.toHaveBeenCalled();
      expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // O assistente grava candidato, nunca fonte da estimativa.
  // -------------------------------------------------------------------------

  it("nunca cria Fonte, Evidencia, SeriePreco nem PrecoConsolidado", async () => {
    const registry = montarRegistry(CTX_PROCESSO);
    const busca = await chamar(registry, "buscar_pncp", { termo: "cadeira" });
    const id = (busca.candidatos as Array<{ id: string }>)[0]!.id;

    await chamar(registry, "registrar_candidatos", {
      itemId: "item-1",
      candidatoIds: [id],
      termoBuscaUsado: "cadeira",
    });

    expect(mocks.db.resultadoSimilaridade.createMany).toHaveBeenCalledTimes(1);
    expect(mocks.db.fonte.create).not.toHaveBeenCalled();
    expect(mocks.db.evidencia.create).not.toHaveBeenCalled();
    expect(mocks.db.seriePreco.create).not.toHaveBeenCalled();
    expect(mocks.db.precoConsolidado.create).not.toHaveBeenCalled();
  });

  it("marca origem, conversa e termo usado no candidato gravado", async () => {
    const registry = montarRegistry(CTX_PROCESSO);
    const busca = await chamar(registry, "buscar_pncp", { termo: "cadeira giratória" });
    const id = (busca.candidatos as Array<{ id: string }>)[0]!.id;

    await chamar(registry, "registrar_candidatos", {
      itemId: "item-1",
      candidatoIds: [id],
      termoBuscaUsado: "cadeira giratória ergonômica",
    });

    const gravado = mocks.db.resultadoSimilaridade.createMany.mock.calls[0]![0].data[0];
    expect(gravado.origem).toBe("assistente");
    expect(gravado.conversaId).toBe("conv-1");
    expect(gravado.termoBuscaUsado).toBe("cadeira giratória ergonômica");
    expect(gravado.promovidoParaFonte).toBeUndefined();
  });

  it("audita a escrita com o processo do item", async () => {
    const registry = montarRegistry(CTX_PROCESSO);
    const busca = await chamar(registry, "buscar_pncp", { termo: "cadeira" });
    const id = (busca.candidatos as Array<{ id: string }>)[0]!.id;

    await chamar(registry, "registrar_candidatos", {
      itemId: "item-1",
      candidatoIds: [id],
      termoBuscaUsado: "cadeira",
    });

    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        processoId: "proc-1",
        acao: "assistente_registrar_candidatos",
      }),
    );
  });

  it("ignora candidato cuja URL já está registrada no item", async () => {
    mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([
      { fonteUrl: "https://pncp.gov.br/app/contrato/123" },
    ]);
    const registry = montarRegistry(CTX_PROCESSO);
    const busca = await chamar(registry, "buscar_pncp", { termo: "cadeira" });
    const id = (busca.candidatos as Array<{ id: string }>)[0]!.id;

    const resposta = await chamar(registry, "registrar_candidatos", {
      itemId: "item-1",
      candidatoIds: [id],
      termoBuscaUsado: "cadeira",
    });

    expect(resposta.registrados).toBe(0);
    expect(resposta.duplicadosIgnorados).toBe(1);
    expect(mocks.db.resultadoSimilaridade.createMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Escopo: uma conversa de processo não alcança outro processo.
  // -------------------------------------------------------------------------

  describe("escopo do processo", () => {
    it("recusa escrever em item de outro processo", async () => {
      mocks.db.item.findUnique.mockResolvedValue({ ...ITEM, processoId: "proc-OUTRO" });
      const registry = montarRegistry(CTX_PROCESSO);
      const busca = await chamar(registry, "buscar_pncp", { termo: "cadeira" });
      const id = (busca.candidatos as Array<{ id: string }>)[0]!.id;

      const resposta = await chamar(registry, "registrar_candidatos", {
        itemId: "item-1",
        candidatoIds: [id],
        termoBuscaUsado: "cadeira",
      });

      expect(resposta.erro).toMatch(/outro processo/i);
      expect(mocks.db.resultadoSimilaridade.createMany).not.toHaveBeenCalled();
    });

    it("recusa ler outro processo quando a conversa está presa a um", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "ler_processo", { processoId: "proc-OUTRO" });

      expect(resposta.erro).toMatch(/presa ao processo aberto/i);
      expect(mocks.db.processo.findUnique).not.toHaveBeenCalled();
    });

    it("na conversa global, exige o processoId em vez de adivinhar", async () => {
      const registry = montarRegistry(CTX_GLOBAL);

      const resposta = await chamar(registry, "ler_processo", {});

      expect(resposta.erro).toMatch(/informe o processoId/i);
      expect(mocks.db.processo.findUnique).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Busca web: guardas e disponibilidade.
  // -------------------------------------------------------------------------

  describe("buscar_web", () => {
    beforeEach(() => {
      mocks.db.site.findMany.mockResolvedValue([
        { url: "https://www.mercadolivre.com.br", lista: "vermelha" },
        { url: "https://www.gov.br", lista: "branca" },
      ]);
      mocks.buscarWebPerplexity.mockResolvedValue({
        resumo: "Encontrei atas de registro de preços.",
        buscadoEm: new Date("2026-07-27T10:00:00Z"),
        modelo: "sonar-pro",
        resultados: [
          { titulo: "Ata TJ-SP", url: "https://tjsp.jus.br/ata/1" },
          { titulo: "Cadeira barata", url: "https://produto.mercadolivre.com.br/x" },
        ],
      });
    });

    it("descarta resultado de domínio da lista vermelha e informa o descarte", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_web", { consulta: "cadeiras ergonômicas" });

      const urls = (resposta.resultados as Array<{ url: string }>).map((r) => r.url);
      expect(urls).toEqual(["https://tjsp.jus.br/ata/1"]);
      expect(urls.some((u) => u.includes("mercadolivre"))).toBe(false);
      // O descarte é informado, não silencioso.
      expect(resposta.descartes).toMatch(/marketplace/i);
    });

    it("manda as listas de sites para o filtro da própria API", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      await chamar(registry, "buscar_web", { consulta: "cadeiras ergonômicas" });

      expect(mocks.buscarWebPerplexity).toHaveBeenCalledWith(
        "cadeiras ergonômicas",
        expect.objectContaining({
          dominiosPermitidos: ["gov.br"],
          dominiosBloqueados: ["mercadolivre.com.br"],
        }),
      );
    });

    it("avisa o modelo de que resultado de web não vira candidato nem evidência", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_web", { consulta: "cadeiras" });

      expect(resposta.aviso).toMatch(/não vira candidato nem evidência/i);
      expect(resposta.aviso).toMatch(/módulo de Sites/i);
    });

    it("não é anunciada ao modelo quando a Perplexity não está configurada", () => {
      mocks.perplexityConfigurada.mockReturnValue(false);

      const nomes = montarRegistry(CTX_PROCESSO).definicoes.map((d) => d.nome);

      expect(nomes).not.toContain("buscar_web");
      expect(nomes).toContain("buscar_pncp");
    });
  });

  // -------------------------------------------------------------------------
  // Robustez: entrada ruim do modelo não derruba o turno.
  // -------------------------------------------------------------------------

  describe("argumentos vindos do modelo", () => {
    it("devolve erro legível quando o JSON é inválido, sem lançar", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resultado = await registry.executar({
        id: "x",
        nome: "buscar_pncp",
        argumentos: "{termo: cadeira",
      });

      expect(resultado.erro).toMatch(/JSON/i);
      expect(mocks.buscarContratosPNCP).not.toHaveBeenCalled();
    });

    it("devolve erro legível quando falta campo obrigatório", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "registrar_candidatos", { itemId: "item-1" });

      expect(resposta.erro).toMatch(/candidatoIds/);
    });

    it("devolve erro em vez de lançar quando a ferramenta externa falha", async () => {
      mocks.buscarContratosPNCP.mockRejectedValue(new Error("PNCP fora do ar"));
      const registry = montarRegistry(CTX_PROCESSO);

      const resultado = await registry.executar({
        id: "x",
        nome: "buscar_pncp",
        argumentos: JSON.stringify({ termo: "cadeira" }),
      });

      expect(resultado.erro).toMatch(/PNCP fora do ar/);
    });

    it("devolve erro para ferramenta desconhecida", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resultado = await registry.executar({
        id: "x",
        nome: "apagar_tudo",
        argumentos: "{}",
      });

      expect(resultado.erro).toMatch(/desconhecida/i);
    });
  });

  it("orienta a variar o termo quando o PNCP não devolve nada", async () => {
    mocks.buscarContratosPNCP.mockResolvedValue([]);
    const registry = montarRegistry(CTX_PROCESSO);

    const resposta = await chamar(registry, "buscar_pncp", { termo: "objeto genérico" });

    expect(resposta.total).toBe(0);
    expect(resposta.observacao).toMatch(/outro recorte|substantivo/i);
  });
});
