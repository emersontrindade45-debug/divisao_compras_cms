import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    site: { findMany: vi.fn() },
    processo: { findUnique: vi.fn(), findMany: vi.fn() },
    item: { findMany: vi.fn(), findUnique: vi.fn() },
    resultadoSimilaridade: { findMany: vi.fn(), createMany: vi.fn() },
    // Presentes de propósito: os testes provam que a ferramenta NUNCA escreve.
    fonte: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    evidencia: { create: vi.fn() },
    precoConsolidado: { create: vi.fn() },
    seriePreco: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    contratacaoPublica: { update: vi.fn(), updateMany: vi.fn() },
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

/**
 * Retrato de processo aceito por `rascunhar_justificativa`. Os três tipos leem o
 * mesmo `findUnique`, então um único mock cobre os três caminhos.
 */
function processoCompleto(overrides: Record<string, unknown> = {}) {
  return {
    id: "proc-1",
    numero: "2026/0042",
    objeto: "Aquisição de cadeiras giratórias",
    itens: [
      {
        id: "item-1",
        descricao: "Cadeira giratória ergonômica",
        unidade: "unidade",
        quantidade: 50,
        fontes: [
          {
            id: "fonte-1",
            tipo: "contratacao_publica",
            descricao: "Ata SRP 12/2025 — Prefeitura de Exemplo",
            status: "incluido",
            valorUnitario: { toString: () => "850.50" },
            dataReferencia: new Date("2026-05-10"),
            _count: { evidencias: 1 },
          },
        ],
        seriePrecos: [
          {
            metodo: "mediana",
            valorEstimado: { toString: () => "860.00" },
            media: { toString: () => "880.00" },
            mediana: { toString: () => "860.00" },
            menorValor: { toString: () => "790.00" },
            coeficienteVariacao: { toString: () => "12.40" },
            totalPrecos: 4,
            precosIncluidos: 3,
            createdAt: new Date("2026-07-01"),
            precos: [
              {
                fonte: "contratacao_publica",
                descricaoFonte: "Ata SRP 12/2025",
                fornecedorOuOrgao: "Prefeitura de Exemplo",
                valorUnitario: { toString: () => "850.50" },
                dataReferencia: new Date("2026-05-10"),
                status: "incluido",
                motivoExclusao: null,
              },
            ],
          },
        ],
      },
    ],
    cotacoes: [],
    contratacoesPublicas: [],
    ...overrides,
  };
}

describe("rascunhar_justificativa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.perplexityConfigurada.mockReturnValue(true);
    mocks.db.site.findMany.mockResolvedValue([]);
    mocks.db.processo.findUnique.mockResolvedValue(processoCompleto());
  });

  // -------------------------------------------------------------------------
  // A garantia central desta fase: a ferramenta é de LEITURA.
  //
  // A justificativa entra nos autos pela mão do servidor, não pela do modelo.
  // Se um dia alguém acrescentar uma escrita aqui, estes testes caem.
  // -------------------------------------------------------------------------

  describe("não persiste nada", () => {
    it.each(["aderencia_fonte", "metodologia_serie", "rota_fornecedores"])(
      "não grava ao rascunhar %s",
      async (tipo) => {
        const registry = montarRegistry(CTX_PROCESSO);

        await chamar(registry, "rascunhar_justificativa", { tipo });

        expect(mocks.db.fonte.update).not.toHaveBeenCalled();
        expect(mocks.db.fonte.updateMany).not.toHaveBeenCalled();
        expect(mocks.db.seriePreco.update).not.toHaveBeenCalled();
        expect(mocks.db.contratacaoPublica.update).not.toHaveBeenCalled();
        expect(mocks.db.contratacaoPublica.updateMany).not.toHaveBeenCalled();
        expect(mocks.db.resultadoSimilaridade.createMany).not.toHaveBeenCalled();
      },
    );

    it("marca o retorno como rascunho que exige revisão humana", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "rascunhar_justificativa", {
        tipo: "aderencia_fonte",
      });

      expect(String(resposta.aviso)).toMatch(/rascunho/i);
      expect(String(resposta.aviso)).toMatch(/revis|servidor/i);
      expect(resposta.persistido).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Os dados vêm do banco, não do modelo (mesma lógica de `registrar_candidatos`).
  // -------------------------------------------------------------------------

  describe("os números vêm do processo real", () => {
    it("devolve as fontes com valor e data para a justificativa de aderência", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "rascunhar_justificativa", {
        tipo: "aderencia_fonte",
      });

      const dados = resposta.dados as Record<string, unknown>;
      const itens = dados.itens as Array<Record<string, unknown>>;
      const fontes = itens[0]!.fontes as Array<Record<string, unknown>>;

      expect(fontes[0]).toMatchObject({
        descricao: "Ata SRP 12/2025 — Prefeitura de Exemplo",
        valorUnitario: 850.5,
        tipo: "contratacao_publica",
        totalEvidencias: 1,
      });
    });

    it("devolve método, dispersão e preços excluídos na justificativa metodológica", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "rascunhar_justificativa", {
        tipo: "metodologia_serie",
      });

      const dados = resposta.dados as Record<string, unknown>;
      const series = dados.series as Array<Record<string, unknown>>;

      expect(series[0]).toMatchObject({
        metodo: "mediana",
        valorEstimado: 860,
        coeficienteVariacao: 12.4,
        precosIncluidos: 3,
        totalPrecos: 4,
      });
    });

    it("sinaliza análise crítica obrigatória quando o CV passa de 30%", async () => {
      const alto = processoCompleto();
      alto.itens[0]!.seriePrecos[0]!.coeficienteVariacao = { toString: () => "41.20" };
      mocks.db.processo.findUnique.mockResolvedValue(alto);
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "rascunhar_justificativa", {
        tipo: "metodologia_serie",
      });

      const dados = resposta.dados as Record<string, unknown>;
      const series = dados.series as Array<Record<string, unknown>>;

      expect(series[0]!.analiseCriticaObrigatoria).toBe(true);
    });

    it("informa o total de fornecedores consultados e sem resposta na rota", async () => {
      mocks.db.processo.findUnique.mockResolvedValue(
        processoCompleto({
          cotacoes: [
            { id: "c1", status: "positiva", fornecedor: { razaoSocial: "Alfa Ltda" } },
            { id: "c2", status: "silenciosa", fornecedor: { razaoSocial: "Beta Ltda" } },
          ],
        }),
      );
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "rascunhar_justificativa", {
        tipo: "rota_fornecedores",
      });

      const dados = resposta.dados as Record<string, unknown>;

      expect(dados).toMatchObject({
        fornecedoresConsultados: 2,
        semResposta: ["Beta Ltda"],
        atendeMinimoTresFornecedores: false,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Conformidade: a justificativa de rota existe para o caso do R-07, em que a
  // fonte pública não foi usada. O dado que sustenta esse texto tem de vir junto.
  // -------------------------------------------------------------------------

  it("informa se houve fonte pública, que é o que o R-07 cobra", async () => {
    mocks.db.processo.findUnique.mockResolvedValue(
      processoCompleto({
        itens: [
          {
            id: "item-1",
            descricao: "Cadeira giratória ergonômica",
            unidade: "unidade",
            quantidade: 50,
            fontes: [
              {
                id: "fonte-9",
                tipo: "fornecedor_direto",
                descricao: "Proposta Alfa Ltda",
                status: "incluido",
                valorUnitario: { toString: () => "910.00" },
                dataReferencia: new Date("2026-06-01"),
                _count: { evidencias: 1 },
              },
            ],
            seriePrecos: [],
          },
        ],
      }),
    );
    const registry = montarRegistry(CTX_PROCESSO);

    const resposta = await chamar(registry, "rascunhar_justificativa", {
      tipo: "rota_fornecedores",
    });

    const dados = resposta.dados as Record<string, unknown>;

    expect(dados.usouFontePublica).toBe(false);
    expect(String(resposta.orientacao)).toMatch(/IN 65|fonte p[úu]blica/i);
  });

  // -------------------------------------------------------------------------
  // Escopo — mesma regra das demais ferramentas.
  // -------------------------------------------------------------------------

  describe("escopo da conversa", () => {
    it("recusa rascunhar para outro processo numa conversa presa a um processo", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "rascunhar_justificativa", {
        tipo: "aderencia_fonte",
        processoId: "proc-outro",
      });

      expect(resposta.erro).toMatch(/processo aberto/i);
      expect(mocks.db.processo.findUnique).not.toHaveBeenCalled();
    });

    it("exige processoId na conversa global", async () => {
      const registry = montarRegistry(CTX_GLOBAL);

      const resposta = await chamar(registry, "rascunhar_justificativa", {
        tipo: "aderencia_fonte",
      });

      expect(resposta.erro).toMatch(/processoId/i);
    });
  });

  // -------------------------------------------------------------------------
  // Entrada não confiável (CLAUDE.md §9.12).
  // -------------------------------------------------------------------------

  it("recusa um tipo de justificativa fora dos três previstos", async () => {
    const registry = montarRegistry(CTX_PROCESSO);

    const resposta = await chamar(registry, "rascunhar_justificativa", {
      tipo: "qualquer_outra",
    });

    expect(resposta.erro).toMatch(/tipo/i);
    expect(mocks.db.processo.findUnique).not.toHaveBeenCalled();
  });

  it("avisa quando não há série consolidada para justificar a metodologia", async () => {
    mocks.db.processo.findUnique.mockResolvedValue(
      processoCompleto({
        itens: [
          {
            id: "item-1",
            descricao: "Cadeira giratória ergonômica",
            unidade: "unidade",
            quantidade: 50,
            fontes: [],
            seriePrecos: [],
          },
        ],
      }),
    );
    const registry = montarRegistry(CTX_PROCESSO);

    const resposta = await chamar(registry, "rascunhar_justificativa", {
      tipo: "metodologia_serie",
    });

    const dados = resposta.dados as Record<string, unknown>;
    expect(dados.series).toEqual([]);
    expect(String(resposta.orientacao)).toMatch(/ainda não|não h[áa]/i);
  });

  it("é anunciada ao modelo entre as ferramentas disponíveis", () => {
    const registry = montarRegistry(CTX_PROCESSO);

    const definicao = registry.definicoes.find((d) => d.nome === "rascunhar_justificativa");

    expect(definicao).toBeDefined();
    expect(definicao!.descricao).toMatch(/rascunho/i);
  });
});
