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
  // Fontes reais que não sabem aplicar o recorte do analista — é o que o aviso
  // de recorte parcial enumera. Sem isto no mock, a chamada estoura dentro do
  // try/catch de `executar` e vira um erro genérico em vez de falha legível.
  fontesQueIgnoramFiltros: () => ["painel_precos", "compras_gov_contratacoes", "sinapi"],
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
    // Passa-tudo por padrão: `buscar_pncp` agora ranqueia com IA em lotes
    // (`rankearEmLotesParalelos`, que chama este mock uma vez por lote de 8), e
    // um retorno fixo faria toda busca colapsar num candidato só. Os testes que
    // exercitam o CORTE da IA sobrescrevem este comportamento.
    mocks.rankearCandidatos.mockImplementation(
      async (_item: unknown, lote: CandidatoSimilaridade[]) =>
        lote.map((c) => ({ ...RANQUEADO, candidato: c })),
    );
  });

  // As invariantes de origem do preço e de score migraram para
  // `lib/actions/__tests__/assistente.test.ts` junto com a escrita: o assistente
  // não grava mais nada por conta própria, quem registra é o clique do servidor.

  // -------------------------------------------------------------------------
  // Escopo: uma conversa de processo não alcança outro processo.
  // -------------------------------------------------------------------------

  describe("escopo do processo", () => {
    it("ignora processoId divergente informado pelo modelo e lê o processo da conversa", async () => {
      // O modelo só conhece o processo pelo NÚMERO (ex.: "1829/2024"), nunca pelo
      // id interno de `ctx.processoId` — então qualquer valor que ele preencha
      // aqui tende a divergir por natureza, não por tentativa real de escapar do
      // escopo. Ver o comentário de `resolverProcesso`.
      mocks.db.processo.findUnique.mockResolvedValue({
        id: "proc-1",
        numero: "1829/2024",
        objeto: "Objeto de teste",
        status: "aberto",
        responsavel: "Servidor Teste",
        dataAbertura: new Date("2026-08-01"),
        itens: [],
      });
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "ler_processo", { processoId: "proc-OUTRO" });

      expect(resposta.erro).toBeUndefined();
      expect(mocks.db.processo.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "proc-1" } }),
      );
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
      // Descrições distintas de propósito: candidatos que só diferem pela URL
      // são duplicatas e a consolidação os funde — o que se testa aqui é a
      // ORDEM, então cada um precisa sobreviver a ela.
      mocks.buscarCandidatosPublicos.mockResolvedValue([
        candidato({ fonteUrl: "https://pncp.gov.br/app/editais/A", fonteDescricao: "Cadeira giratória A" }),
        candidato({ fonteUrl: "https://pncp.gov.br/app/editais/B", fonteDescricao: "Cadeira giratória B" }),
        candidato({ fonteUrl: "https://pncp.gov.br/app/editais/C", fonteDescricao: "Cadeira giratória C" }),
      ]);
      mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([
        { fonteDescricao: "Cadeira giratória A" },
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

    it("libera vaga: cada descarte puxa um candidato inédito para dentro do corte", async () => {
      // O ponto do descarte é abrir espaço. Enquanto o corte de 25 era aplicado
      // ANTES da demoção, o descartado só era reordenado dentro da tela e nada
      // novo subia — o analista descartava e a tela não mudava.
      //
      // 26 candidatos, o PRIMEIRO já descartado: sem liberar vaga, ele ocuparia
      // uma das 25 e o inédito de índice 25 ficaria de fora.
      const muitos = Array.from({ length: 26 }, (_, i) =>
        candidato({
          fonteUrl: `https://pncp.gov.br/app/editais/${i}`,
          fonteDescricao: `Cadeira giratória modelo ${i}`,
        }),
      );
      mocks.buscarCandidatosPublicos.mockResolvedValue(muitos);
      mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([
        { fonteDescricao: "Cadeira giratória modelo 0" },
      ]);
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", { termo: "cadeira" });

      const urls = (resposta.candidatos as Array<{ url: string }>).map((c) => c.url);
      expect(urls).toHaveLength(25);
      // O inédito que só cabe porque o descartado saiu da frente.
      expect(urls).toContain("https://pncp.gov.br/app/editais/25");
      // E o descartado não gastou vaga.
      expect(urls).not.toContain("https://pncp.gov.br/app/editais/0");
    });

    // -----------------------------------------------------------------------
    // Consolidação de duplicatas. Os dois casos vêm de um resultado real de
    // produção (processo 1829/2024, 2026-08-26), onde 21 dos 24 cards exibidos
    // eram a MESMA frase de catálogo e o analista os descartou um a um.
    // -----------------------------------------------------------------------

    it("limita a MAX_POR_DESCRICAO cards com a mesma descrição, liberando as vagas", async () => {
      // "TAXA DE INSTALAÇÃO LINK DE INTERNET - STFC (BANDA LARGA)": 1 descrição,
      // 22 órgãos, valores de R$ 0,01 a R$ 114.000,00. Antes, os 22 tomavam a
      // tela e os candidatos inéditos atrás deles nunca apareciam.
      // 26 repetições, uma a mais que o corte de MAX_SUGESTOES_POR_BUSCA: é o
      // que torna a ORDEM observável. Consolidando antes do corte, o inédito
      // entra; consolidando depois, as 25 primeiras vagas já foram gastas com
      // repetição e ele nunca chega à tela (CLAUDE.md §9.91).
      const enchente = Array.from({ length: 26 }, (_, i) =>
        candidato({
          fonteDescricao: "TAXA DE INSTALAÇÃO LINK DE INTERNET - STFC (BANDA LARGA)",
          fonteOrgaoOuId: `Município ${i}`,
          fonteUrl: `https://pncp.gov.br/app/editais/taxa-${i}`,
          valorUnitario: 100 + i,
        }),
      );
      // Casa o termo mais fracamente que a enchente, então fica no fim da
      // ordenação por aderência — que é a posição em que o corte o mataria.
      const inedito = candidato({
        fonteDescricao: "Link dedicado de internet 900 Mbps via fibra óptica",
        fonteUrl: "https://pncp.gov.br/app/editais/inedito",
      });
      mocks.buscarCandidatosPublicos.mockResolvedValue([...enchente, inedito]);
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", {
        termo: "taxa de instalação link de internet stfc",
      });

      const urls = (resposta.candidatos as Array<{ url: string }>).map((c) => c.url);
      const daEnchente = urls.filter((u) => u.includes("/taxa-"));
      expect(daEnchente).toHaveLength(3);
      // A vaga liberada é o ponto: o inédito estava em 27º.
      expect(urls).toContain("https://pncp.gov.br/app/editais/inedito");
      // E o modelo é avisado, senão diria que a busca rendeu 4 quando achou 27.
      expect(resposta.observacao).toContain("23 candidato(s) repetido(s)");
    });

    it("funde duplicata exata — mesma descrição, mesmo órgão e mesmo valor", async () => {
      // Caso real: "ACESSO INTERNET - LINK DEDICADO 600 MBPS" a R$ 320,12 do
      // mesmo município, em dois editais e três números de item. Promovidos os
      // três, o MESMO preço entraria três vezes na série e puxaria a mediana.
      // Note o ponto final numa das grafias: só a normalização as une.
      mocks.buscarCandidatosPublicos.mockResolvedValue([
        candidato({
          fonteDescricao: "ACESSO INTERNET - LINK DEDICADO 600 MBPS.",
          fonteOrgaoOuId: "MUNICIPIO DE PARA DE MINAS",
          valorUnitario: 320.12,
          fonteUrl: "https://pncp.gov.br/app/editais/18313817000185/2025/147",
        }),
        candidato({
          fonteDescricao: "ACESSO INTERNET - LINK DEDICADO 600 MBPS",
          fonteOrgaoOuId: "MUNICIPIO DE PARA DE MINAS",
          valorUnitario: 320.12,
          fonteUrl: "https://pncp.gov.br/app/editais/18313817000185/2025/146",
        }),
        candidato({
          fonteDescricao: "ACESSO INTERNET - LINK DEDICADO 600 MBPS.",
          fonteOrgaoOuId: "MUNICIPIO DE PARA DE MINAS",
          valorUnitario: 320.12,
          fonteUrl: "https://pncp.gov.br/app/editais/18313817000185/2025/146",
        }),
      ]);
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", { termo: "link dedicado" });

      expect(resposta.candidatos).toHaveLength(1);
    });

    it("mantém preços diferentes do mesmo órgão — dispersão não é duplicata", async () => {
      // A fusão exata não pode virar fusão por órgão: dois preços distintos são
      // duas observações, e é delas que a série de preços é feita.
      mocks.buscarCandidatosPublicos.mockResolvedValue([
        candidato({ fonteDescricao: "Link dedicado 600 Mbps", fonteOrgaoOuId: "Município X", valorUnitario: 320.12 }),
        candidato({ fonteDescricao: "Link dedicado 600 Mbps", fonteOrgaoOuId: "Município X", valorUnitario: 480.0 }),
      ]);
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", { termo: "link dedicado" });

      expect(resposta.candidatos).toHaveLength(2);
    });

    it("descarte vale entre órgãos: uma descrição descartada demove a família toda", async () => {
      // O defeito que custou 21 cliques: com a URL na chave, cada um dos 22
      // órgãos tinha chave própria e nenhum descarte valia para o seguinte.
      mocks.buscarCandidatosPublicos.mockResolvedValue([
        candidato({
          fonteDescricao: "TAXA DE INSTALAÇÃO LINK DE INTERNET - STFC (BANDA LARGA)",
          fonteOrgaoOuId: "Município A",
          fonteUrl: "https://pncp.gov.br/app/editais/taxa-A",
          valorUnitario: 98,
        }),
        candidato({
          fonteDescricao: "Link dedicado de internet 900 Mbps",
          fonteUrl: "https://pncp.gov.br/app/editais/bom",
        }),
      ]);
      // O analista descartou a taxa uma vez, num edital de OUTRO órgão.
      mocks.db.resultadoSimilaridade.findMany.mockResolvedValue([
        { fonteDescricao: "taxa de instalação link de internet - stfc (banda larga)" },
      ]);
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", { termo: "link dedicado" });

      const urls = (resposta.candidatos as Array<{ url: string }>).map((c) => c.url);
      expect(urls).toEqual([
        "https://pncp.gov.br/app/editais/bom",
        "https://pncp.gov.br/app/editais/taxa-A",
      ]);
    });

    it("aplica o corte de relevância da IA, tirando o ruído da tela", async () => {
      // O que a ordenação lexical não resolve: switch e impressora casam tokens
      // ("fibra", "900") mas não são o produto. A IA compara especificação e
      // unidade, e é ela que os elimina.
      mocks.buscarCandidatosPublicos.mockResolvedValue([
        candidato({ fonteUrl: "https://pncp.gov.br/app/editais/link", fonteDescricao: "Link dedicado 900 Mbps" }),
        candidato({ fonteUrl: "https://pncp.gov.br/app/editais/switch", fonteDescricao: "Switch 24 portas fibra 900W" }),
      ]);
      mocks.rankearCandidatos.mockImplementation(
        async (_item: unknown, lote: CandidatoSimilaridade[]) =>
          lote
            .filter((c) => c.fonteDescricao.startsWith("Link"))
            .map((c) => ({ ...RANQUEADO, candidato: c })),
      );
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", {
        termo: "link dedicado",
        itemId: "item-1",
      });

      const urls = (resposta.candidatos as Array<{ url: string }>).map((c) => c.url);
      expect(urls).toEqual(["https://pncp.gov.br/app/editais/link"]);
    });

    it("devolve VAZIO quando a IA reprova todos — não ressuscita o lixo", async () => {
      // Defeito real em produção (2026-08-25): `[]` da IA era lido como falha e
      // o fallback devolvia os 25 reprovados. A busca "banda dedicada 900 mbps"
      // encheu a tela de EXAME GENÉTICO (casou "bandas") e o modelo ainda
      // escolheu um "melhor candidato" entre eles.
      mocks.buscarCandidatosPublicos.mockResolvedValue([
        candidato({ fonteDescricao: "EXAME GENETICO - CARIOTIPO COM BANDAS" }),
        candidato({
          fonteDescricao: "PRESTACAO DE SERVICO DE JARDINAGEM - GRAMADOS",
          fonteUrl: "https://pncp.gov.br/app/editais/jardim",
        }),
      ]);
      mocks.rankearCandidatos.mockResolvedValue([]);
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", {
        termo: "banda dedicada 900 mbps",
        itemId: "item-1",
      });

      expect(resposta.candidatos).toEqual([]);
      expect(resposta.total).toBe(0);
      // E o modelo precisa saber que foi reprovação de aderência, não busca
      // vazia — senão orienta o próximo passo errado.
      expect(String(resposta.observacao)).toContain("NENHUM é comparável");
    });

    it("mantém a ordem lexical quando o ranqueamento de IA falha por inteiro", async () => {
      // Falha de infraestrutura não pode esvaziar a tela do analista.
      mocks.buscarCandidatosPublicos.mockResolvedValue([
        candidato({ fonteUrl: "https://pncp.gov.br/app/editais/A", fonteDescricao: "Cadeira giratória A" }),
        candidato({ fonteUrl: "https://pncp.gov.br/app/editais/B", fonteDescricao: "Cadeira giratória B" }),
      ]);
      mocks.rankearCandidatos.mockRejectedValue(new Error("OpenAI fora do ar"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", {
        termo: "cadeira",
        itemId: "item-1",
      });

      expect(resposta.candidatos).toHaveLength(2);
    });

    it("não chama a IA quando o itemId do modelo não resolve", async () => {
      // O modelo manda "1", "item-1", "0908/2022"... sem item real não há contra
      // o quê ranquear, e a busca degrada para a ordem lexical.
      mocks.db.item.findUnique.mockResolvedValue(null);
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", {
        termo: "cadeira",
        itemId: "1",
      });

      expect(mocks.rankearCandidatos).not.toHaveBeenCalled();
      expect(resposta.candidatos).toHaveLength(1);
    });

    it("consulta os descartes só deste processo, pela descrição", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      await chamar(registry, "buscar_pncp", { termo: "cadeira" });

      expect(mocks.db.resultadoSimilaridade.findMany).toHaveBeenCalledWith({
        where: { item: { processoId: "proc-1" }, descartado: true },
        // Só a descrição: a URL saiu da chave para o descarte valer entre
        // órgãos. Com ela, 21 cards de descrição idêntica vindos de 22 órgãos
        // tinham 21 chaves diferentes e nenhum dos descartes ensinava nada.
        select: { fonteDescricao: true },
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

  // -------------------------------------------------------------------------
  // Recorte geográfico/administrativo (P4).
  //
  // O PNCP falha de duas formas silenciosas e OPOSTAS com valor inválido,
  // medidas em 2026-08-26: `ufs=XX` (e `ufs=sp` minúsculo) devolve 0 resultados
  // em vez de erro; `status=lixo` é ignorado e devolve o total sem filtro.
  // Nenhuma das duas é detectável pela resposta — por isso a validação é na
  // fronteira, com enum fechado.
  // -------------------------------------------------------------------------
  describe("buscar_pncp — recorte por UF/esfera/situação", () => {
    it("repassa o recorte válido para a busca", async () => {
      mocks.buscarCandidatosPublicos.mockResolvedValue([candidato({})]);
      const registry = montarRegistry(CTX_PROCESSO);

      await chamar(registry, "buscar_pncp", { termo: "cadeira", uf: "SP", esfera: "M" });

      expect(mocks.buscarCandidatosPublicos).toHaveBeenCalledWith("cadeira", {
        timeoutMsPorProvedor: expect.any(Number),
        filtros: { uf: "SP", esfera: "M" },
      });
    });

    it("não inventa um objeto de filtros quando nada foi pedido", async () => {
      mocks.buscarCandidatosPublicos.mockResolvedValue([candidato({})]);
      const registry = montarRegistry(CTX_PROCESSO);

      await chamar(registry, "buscar_pncp", { termo: "cadeira" });

      expect(mocks.buscarCandidatosPublicos).toHaveBeenCalledWith("cadeira", {
        timeoutMsPorProvedor: expect.any(Number),
      });
    });

    it("rejeita UF inexistente ANTES de chamar a busca", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", { termo: "cadeira", uf: "XX" });

      // Sem esta guarda o PNCP devolveria 0 resultados sem erro, e o modelo
      // diria ao analista que não existe contratação pública para o objeto.
      expect(resposta.erro).toBeTruthy();
      expect(mocks.buscarCandidatosPublicos).not.toHaveBeenCalled();
    });

    it("rejeita UF em minúsculas, que o PNCP trata como inexistente", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", { termo: "cadeira", uf: "sp" });

      expect(resposta.erro).toBeTruthy();
      expect(mocks.buscarCandidatosPublicos).not.toHaveBeenCalled();
    });

    it("rejeita lista de UFs, que a API não suporta e responde com zero", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", { termo: "cadeira", uf: "SP,RJ" });

      expect(resposta.erro).toBeTruthy();
      expect(mocks.buscarCandidatosPublicos).not.toHaveBeenCalled();
    });

    it("rejeita status inválido, que o PNCP ignoraria em silêncio", async () => {
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", { termo: "cadeira", status: "lixo" });

      expect(resposta.erro).toBeTruthy();
      expect(mocks.buscarCandidatosPublicos).not.toHaveBeenCalled();
    });

    it("avisa que o recorte valeu só para o PNCP", async () => {
      mocks.buscarCandidatosPublicos.mockResolvedValue([candidato({})]);
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", { termo: "cadeira", uf: "SP" });

      // Prometer "só SP" e devolver resultado nacional por três das quatro
      // fontes, sem dizer, é o modo de falha da §9.40.
      expect(resposta.observacao).toMatch(/apenas ao PNCP/i);
      expect(resposta.observacao).toMatch(/UF SP/);
    });

    it("não avisa nada quando não há recorte", async () => {
      mocks.buscarCandidatosPublicos.mockResolvedValue([candidato({})]);
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", { termo: "cadeira" });

      expect(resposta.observacao).not.toMatch(/apenas ao PNCP/i);
    });

    it("sugere remover o recorte quando ele zera o resultado", async () => {
      mocks.buscarCandidatosPublicos.mockResolvedValue([]);
      const registry = montarRegistry(CTX_PROCESSO);

      const resposta = await chamar(registry, "buscar_pncp", { termo: "cadeira", uf: "SP" });

      // "Troque o substantivo-núcleo" seria conselho errado aqui: o termo pode
      // estar certo e o recorte é que cortou 85% do universo.
      expect(resposta.total).toBe(0);
      expect(resposta.observacao).toMatch(/RECORTE PEDIDO/);
    });

    it("expõe o recorte ao modelo como enum, não como texto livre", async () => {
      const registry = montarRegistry(CTX_PROCESSO);
      const def = registry.definicoes.find((d) => d.nome === "buscar_pncp");
      const props = (def?.parametros as { properties: Record<string, { enum?: string[] }> })
        .properties;

      expect(props.uf?.enum).toContain("SP");
      expect(props.uf?.enum).toHaveLength(27);
      expect(props.esfera?.enum).toEqual(["F", "E", "M"]);
    });
  });
});
