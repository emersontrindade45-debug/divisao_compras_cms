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
  buscarCandidatosPublicos: vi.fn(),
  buscarWebPerplexity: vi.fn(),
  perplexityConfigurada: vi.fn(),
  rankearCandidatos: vi.fn(),
  getProvedorIA: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("@/lib/similaridade/buscarCandidatosPublicos", () => ({
  buscarCandidatosPublicos: mocks.buscarCandidatosPublicos,
}));
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
    mocks.buscarCandidatosPublicos.mockResolvedValue([candidato()]);
    mocks.rankearCandidatos.mockResolvedValue([RANQUEADO]);
  });

  // As invariantes de origem do preço e de score migraram para
  // `lib/actions/__tests__/assistente.test.ts` junto com a escrita: o assistente
  // não grava mais nada por conta própria, quem registra é o clique do servidor.

  // -------------------------------------------------------------------------
  // Escopo: uma conversa de processo não alcança outro processo.
  // -------------------------------------------------------------------------

  describe("escopo do processo", () => {
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
      expect(mocks.buscarCandidatosPublicos).not.toHaveBeenCalled();
    });

    it("devolve erro legível quando falta campo obrigatório", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", { itemId: "item-1" });

      expect(resposta.erro).toMatch(/termo/);
    });

    it("devolve erro em vez de lançar quando a ferramenta externa falha", async () => {
      mocks.buscarCandidatosPublicos.mockRejectedValue(new Error("PNCP fora do ar"));
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

  it("orienta a variar o termo quando nenhuma fonte devolve nada", async () => {
    mocks.buscarCandidatosPublicos.mockResolvedValue([]);
    const registry = montarRegistry(CTX_PROCESSO);

    const resposta = await chamar(registry, "buscar_pncp", { termo: "objeto genérico" });

    expect(resposta.total).toBe(0);
    expect(resposta.observacao).toMatch(/outro recorte|substantivo/i);
  });

  // -------------------------------------------------------------------------
  // Descartados: reaparecem (M20/eb9cf46 — o analista pode mudar de ideia),
  // mas perdem prioridade para não ocupar o corte de 25 na frente de um
  // candidato nunca visto.
  // -------------------------------------------------------------------------

  describe("buscar_pncp — descartados não somem, só perdem prioridade", () => {
    it("empurra candidato já descartado para o fim, sem excluí-lo", async () => {
      mocks.buscarCandidatosPublicos.mockResolvedValue([
        candidato({ fonteUrl: "https://pncp.gov.br/app/editais/A" }),
        candidato({ fonteUrl: "https://pncp.gov.br/app/editais/B" }),
        candidato({ fonteUrl: "https://pncp.gov.br/app/editais/C" }),
      ]);
      mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([
        { fonteUrl: "https://pncp.gov.br/app/editais/A" },
      ]);
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", { termo: "cadeira" });

      const urls = (resposta.candidatos as Array<{ url: string }>).map((c) => c.url);
      expect(urls).toEqual([
        "https://pncp.gov.br/app/editais/B",
        "https://pncp.gov.br/app/editais/C",
        "https://pncp.gov.br/app/editais/A",
      ]);
      // Nada foi excluído: os 3 continuam no total.
      expect(resposta.total).toBe(3);
    });

    it("consulta os descartes só deste processo, com URL não nula", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      await chamar(registry, "buscar_pncp", { termo: "cadeira" });

      expect(mocks.db.resultadoSimilaridade.findMany).toHaveBeenCalledWith({
        where: { item: { processoId: "proc-1" }, descartado: true, fonteUrl: { not: null } },
        select: { fonteUrl: true },
      });
    });

    it("não consulta descartes na conversa global (sem processoId)", async () => {
      const registry = montarRegistry(CTX_GLOBAL);

      await chamar(registry, "buscar_pncp", { termo: "cadeira" });

      expect(mocks.db.resultadoSimilaridade.findMany).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Filtro de valor: nenhuma fonte pública tem esse parâmetro nativamente
  // (ver pncp.ts, filtrarPorValor) — o modelo só pode pedir a faixa, e o
  // filtro é aplicado localmente sobre o resultado já mesclado das 4 fontes.
  // -------------------------------------------------------------------------

  describe("buscar_pncp — faixa de valor", () => {
    it("busca sem a faixa e filtra localmente o resultado mesclado", async () => {
      mocks.buscarCandidatosPublicos.mockResolvedValue([
        candidato({ valorUnitario: 20 }),
        candidato({ valorUnitario: 999, fonteUrl: "https://pncp.gov.br/app/editais/fora-da-faixa" }),
      ]);
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", {
        termo: "cadeira",
        valorMinimo: 18,
        valorMaximo: 25,
      });

      expect(mocks.buscarCandidatosPublicos).toHaveBeenCalledWith("cadeira", {
        timeoutMsPorProvedor: expect.any(Number),
      });
      expect(resposta.total).toBe(1);
    });

    it("rejeita valorMinimo maior que valorMaximo", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", {
        termo: "cadeira",
        valorMinimo: 30,
        valorMaximo: 10,
      });

      expect(resposta.erro).toMatch(/valorMinimo/);
      expect(mocks.buscarCandidatosPublicos).not.toHaveBeenCalled();
    });

    it("orienta a ampliar a faixa (não o termo) quando o filtro de valor zera o resultado", async () => {
      mocks.buscarCandidatosPublicos.mockResolvedValue([candidato({ valorUnitario: 999 })]);
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", {
        termo: "cadeira",
        valorMinimo: 18,
        valorMaximo: 25,
      });

      expect(resposta.total).toBe(0);
      expect(resposta.observacao).toMatch(/ampliar a faixa/i);
    });
  });
});
