import { describe, it, expect, vi, afterEach } from "vitest";
import { buscarContratosPNCP, listarItensDaCompraPNCP } from "../pncp";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function mockBusca(items: unknown[]) {
  return {
    ok: true,
    json: async () => ({ items }),
  } as Response;
}

function mockJson(corpo: unknown) {
  return {
    ok: true,
    json: async () => corpo,
  } as Response;
}

/** Item como o PNCP devolve em /itens: sem valor homologado, que vive em /resultados. */
function itemDe(over: Record<string, unknown> = {}) {
  return {
    numeroItem: 1,
    descricao: "Cadeira de escritório",
    valorUnitarioEstimado: 250.5,
    quantidade: 50,
    unidadeMedida: "unidade",
    dataAtualizacao: "2026-01-10T00:00:00Z",
    temResultado: true,
    ...over,
  };
}

/** Resultado do julgamento: é daqui que sai o preço efetivamente contratado. */
function resultadoDe(over: Record<string, unknown> = {}) {
  return {
    numeroItem: 1,
    valorUnitarioHomologado: 100,
    quantidadeHomologada: 40,
    dataResultado: "2026-02-20",
    dataCancelamento: null,
    ordemClassificacaoSrp: 1,
    sequencialResultado: 1,
    nomeRazaoSocialFornecedor: "Fornecedor X",
    ...over,
  };
}

/**
 * Roteia as três chamadas do fluxo. A ordem importa: a URL de resultados
 * (`/itens/1/resultados`) também casa com "/itens", então ela é testada primeiro.
 *
 * `processos` aceita array (replicado para todas as páginas da busca textual)
 * ou função `(pagina: number) => unknown[]` (para testes que precisam controlar
 * o conteúdo de cada página independentemente).
 */
function mockPncp(opcoes: {
  processos: unknown[] | ((pagina: number) => unknown[]);
  itens?: unknown[] | ((pagina: number) => unknown[]);
  resultados?: unknown[] | ((numeroItem: number) => unknown[]);
  onUrl?: (url: string) => void;
}) {
  const { processos, itens = [itemDe()], resultados = [resultadoDe()], onUrl } = opcoes;

  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    onUrl?.(url);

    if (url.includes("/api/search/")) {
      const paginaBusca = Number(new URL(url).searchParams.get("pagina") ?? 1);
      const itensBusca = typeof processos === "function" ? processos(paginaBusca) : processos;
      return mockBusca(itensBusca);
    }

    if (url.includes("/resultados")) {
      const numeroItem = Number(url.match(/\/itens\/(\d+)\/resultados/)?.[1] ?? 0);
      return mockJson(typeof resultados === "function" ? resultados(numeroItem) : resultados);
    }

    if (url.includes("/itens")) {
      const pagina = Number(new URL(url).searchParams.get("pagina") ?? 1);
      return mockJson(typeof itens === "function" ? itens(pagina) : pagina === 1 ? itens : []);
    }

    throw new Error(`URL inesperada: ${url}`);
  });
}

const processoPadrao = {
  numero_controle_pncp: "123",
  orgao_nome: "Prefeitura Teste",
  orgao_cnpj: "00000000000100",
  ano: "2026",
  numero_sequencial: "1",
};

describe("buscarContratosPNCP", () => {
  it("busca pelo termo informado e mapeia os itens para CandidatoSimilaridade", async () => {
    mockPncp({ processos: [processoPadrao] });

    const resultado = await buscarContratosPNCP("cadeira de escritório");

    expect(resultado.length).toBeGreaterThan(0);
    expect(resultado[0]).toMatchObject({
      tipoCandidato: "contratacao_publica",
      fonteDescricao: "Cadeira de escritório",
      fonteOrgaoOuId: "Prefeitura Teste",
      unidade: "unidade",
    });
  });

  it("ordena a busca textual por relevância, não por data", async () => {
    const urls: string[] = [];
    mockPncp({ processos: [], onUrl: (u) => urls.push(u) });

    await buscarContratosPNCP("cadeira de escritório");

    const urlBusca = urls.find((u) => u.includes("/api/search/"));
    expect(urlBusca).toContain("ordenacao=relevancia");
    expect(urlBusca).not.toContain("ordenacao=-data");
  });

  it("retorna lista vazia quando o termo é vazio", async () => {
    const resultado = await buscarContratosPNCP("");
    expect(resultado).toEqual([]);
  });

  it("retorna lista vazia quando a busca textual falha", async () => {
    vi.useFakeTimers();
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 500 } as Response);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const promessa = buscarContratosPNCP("qualquer coisa");
    await vi.runAllTimersAsync();
    const resultado = await promessa;

    expect(resultado).toEqual([]);
    vi.useRealTimers();
  });

  it("tenta de novo com backoff quando a rede falha e sucede na tentativa seguinte", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let chamadasBusca = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/search/")) {
        chamadasBusca++;
        if (chamadasBusca === 1) throw new Error("read ECONNRESET");
        return mockBusca([processoPadrao]);
      }
      if (url.includes("/itens")) return mockJson([]);
      throw new Error(`URL inesperada: ${url}`);
    });

    const promessa = buscarContratosPNCP("caneta");
    await vi.runAllTimersAsync();
    await promessa;

    // Com duas páginas em paralelo: página 1 (falha, chamadasBusca=1),
    // página 2 (sucede, chamadasBusca=2), retry de página 1 (sucede, chamadasBusca=3).
    expect(chamadasBusca).toBe(3);
    vi.useRealTimers();
  });

  it("retenta em HTTP 429 (throttling) até esgotar as tentativas", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue({ ok: false, status: 429 } as Response);

    const promessa = buscarContratosPNCP("caneta");
    await vi.runAllTimersAsync();
    const resultado = await promessa;

    expect(resultado).toEqual([]);
    // Duas páginas em paralelo × 3 tentativas cada = 6 requisições totais.
    expect(fetchSpy).toHaveBeenCalledTimes(6);
    vi.useRealTimers();
  });

  it("limita a concorrência das buscas de itens a 5 por vez", async () => {
    const processos = Array.from({ length: 12 }, (_, i) => ({
      numero_controle_pncp: String(i),
      orgao_nome: "Órgão",
      orgao_cnpj: "00000000000100",
      ano: "2026",
      numero_sequencial: String(i),
    }));

    let emVoo = 0;
    let maxEmVoo = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/search/")) return mockBusca(processos);
      emVoo++;
      maxEmVoo = Math.max(maxEmVoo, emVoo);
      await new Promise((r) => setTimeout(r, 1));
      emVoo--;
      return mockJson([]);
    });

    await buscarContratosPNCP("caneta");

    expect(maxEmVoo).toBeLessThanOrEqual(5);
  });
});

// O defeito que motivou esta implementação: o valor estimado é o orçamento feito
// ANTES do certame; o homologado é o preço efetivamente contratado. Usar o estimado
// como referência inflava a série de preços (relato do usuário em 2026-07-30).
describe("valor homologado (e não estimado)", () => {
  it("usa valorUnitarioHomologado do endpoint de resultados, ignorando o estimado", async () => {
    mockPncp({
      processos: [processoPadrao],
      itens: [itemDe({ valorUnitarioEstimado: 146.98 })],
      resultados: [resultadoDe({ valorUnitarioHomologado: 50 })],
    });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado[0]?.valorUnitario).toBe(50);
    expect(resultado[0]?.valorUnitario).not.toBe(146.98);
  });

  it("usa a quantidade homologada e a data do resultado como referência", async () => {
    mockPncp({
      processos: [processoPadrao],
      itens: [itemDe({ quantidade: 120, dataAtualizacao: "2026-01-10T00:00:00Z" })],
      resultados: [resultadoDe({ quantidadeHomologada: 90, dataResultado: "2026-03-05" })],
    });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado[0]?.quantidade).toBe(90);
    expect(resultado[0]?.dataReferencia.toISOString()).toContain("2026-03-05");
  });

  it("descarta o item quando não há resultado homologado", async () => {
    mockPncp({ processos: [processoPadrao], resultados: [] });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado).toEqual([]);
  });

  it("descarta resultado cancelado", async () => {
    mockPncp({
      processos: [processoPadrao],
      resultados: [resultadoDe({ dataCancelamento: "2026-03-01" })],
    });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado).toEqual([]);
  });

  it("descarta resultado com valor homologado zerado", async () => {
    mockPncp({
      processos: [processoPadrao],
      resultados: [resultadoDe({ valorUnitarioHomologado: 0 })],
    });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado).toEqual([]);
  });

  it("escolhe o primeiro colocado quando o item tem vários fornecedores classificados", async () => {
    mockPncp({
      processos: [processoPadrao],
      resultados: [
        resultadoDe({ valorUnitarioHomologado: 90, ordemClassificacaoSrp: 3, sequencialResultado: 1 }),
        resultadoDe({ valorUnitarioHomologado: 70, ordemClassificacaoSrp: 1, sequencialResultado: 2 }),
        resultadoDe({ valorUnitarioHomologado: 80, ordemClassificacaoSrp: 2, sequencialResultado: 3 }),
      ],
    });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado[0]?.valorUnitario).toBe(70);
  });

  it("ignora o cancelado ao escolher entre vários resultados", async () => {
    mockPncp({
      processos: [processoPadrao],
      resultados: [
        resultadoDe({ valorUnitarioHomologado: 70, ordemClassificacaoSrp: 1, dataCancelamento: "2026-03-01" }),
        resultadoDe({ valorUnitarioHomologado: 85, ordemClassificacaoSrp: 2, sequencialResultado: 2 }),
      ],
    });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado[0]?.valorUnitario).toBe(85);
  });

  it("não consulta resultados de item marcado com temResultado false", async () => {
    const urls: string[] = [];
    mockPncp({
      processos: [processoPadrao],
      itens: [itemDe({ temResultado: false })],
      onUrl: (u) => urls.push(u),
    });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado).toEqual([]);
    expect(urls.some((u) => u.includes("/resultados"))).toBe(false);
  });
});

// Defeito medido contra a API real em 2026-07-30: o padrão de /itens é 10 registros
// por página. Sem paginar, uma compra de 418 itens devolvia 10 — 2,4% dela.
describe("paginação dos itens da compra", () => {
  it("envia tamanhoPagina na requisição de itens", async () => {
    const urls: string[] = [];
    mockPncp({ processos: [processoPadrao], onUrl: (u) => urls.push(u) });

    await buscarContratosPNCP("cadeira");

    const urlItens = urls.find((u) => u.includes("/itens") && !u.includes("/resultados"));
    expect(urlItens).toContain("tamanhoPagina=500");
    expect(urlItens).toContain("pagina=1");
  });

  it("busca a página seguinte quando a primeira vem cheia", async () => {
    const paginaCheia = Array.from({ length: 500 }, (_, i) =>
      itemDe({ numeroItem: i + 1, descricao: "Cadeira modelo " + (i + 1) }),
    );
    const paginasPedidas: number[] = [];

    mockPncp({
      processos: [processoPadrao],
      itens: (pagina) => {
        paginasPedidas.push(pagina);
        return pagina === 1 ? paginaCheia : pagina === 2 ? [itemDe({ numeroItem: 501 })] : [];
      },
    });

    await buscarContratosPNCP("cadeira");

    expect(paginasPedidas).toContain(2);
  });

  it("para de paginar quando a página vem incompleta", async () => {
    const paginasPedidas: number[] = [];
    mockPncp({
      processos: [processoPadrao],
      itens: (pagina) => {
        paginasPedidas.push(pagina);
        return pagina === 1 ? [itemDe()] : [];
      },
    });

    await buscarContratosPNCP("cadeira");

    // Página 1 veio com 1 item (< 500): não há motivo para pedir a 2.
    expect(paginasPedidas).toEqual([1]);
  });

  it("encontra item que estaria além da primeira página", async () => {
    const paginaCheia = Array.from({ length: 500 }, (_, i) =>
      itemDe({ numeroItem: i + 1, descricao: "Parafuso " + (i + 1), temResultado: false }),
    );

    mockPncp({
      processos: [processoPadrao],
      itens: (pagina) =>
        pagina === 1
          ? paginaCheia
          : pagina === 2
            ? [itemDe({ numeroItem: 501, descricao: "Cadeira giratória" })]
            : [],
      resultados: [resultadoDe({ valorUnitarioHomologado: 333 })],
    });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.valorUnitario).toBe(333);
  });
});

describe("filtro de relevância e limpeza da descrição", () => {
  it("não consulta o resultado de itens sem relação com o termo", async () => {
    const urls: string[] = [];
    mockPncp({
      processos: [processoPadrao],
      itens: [
        itemDe({ numeroItem: 1, descricao: "Cadeira giratória" }),
        itemDe({ numeroItem: 2, descricao: "Dipirona sódica 500mg" }),
        itemDe({ numeroItem: 3, descricao: "Seringa descartável" }),
      ],
      onUrl: (u) => urls.push(u),
    });

    await buscarContratosPNCP("cadeira");

    const consultados = urls.filter((u) => u.includes("/resultados"));
    expect(consultados).toHaveLength(1);
    expect(consultados[0]).toContain("/itens/1/resultados");
  });

  it("não filtra nada quando o termo não tem token utilizável", async () => {
    const urls: string[] = [];
    mockPncp({
      processos: [processoPadrao],
      itens: [itemDe({ numeroItem: 7, descricao: "Item qualquer" })],
      onUrl: (u) => urls.push(u),
    });

    // "de a" tokeniza para vazio (tokens de até 2 letras são descartados).
    await buscarContratosPNCP("de a");

    expect(urls.some((u) => u.includes("/itens/7/resultados"))).toBe(true);
  });

  it("não filtra nada quando sobra só token genérico no termo", async () => {
    const urls: string[] = [];
    mockPncp({
      processos: [processoPadrao],
      itens: [itemDe({ numeroItem: 7, descricao: "Item qualquer" })],
      onUrl: (u) => urls.push(u),
    });

    // Todos os tokens caem na lista de sem-poder-discriminante: o termo fica vazio
    // e vale a mesma regra de "consultar demais é melhor que devolver zero".
    await buscarContratosPNCP("aquisicao de material novo");

    expect(urls.some((u) => u.includes("/itens/7/resultados"))).toBe(true);
  });
});

// O modo de falha da CLAUDE.md §9.64: o filtro antigo mantinha o item que
// compartilhasse **qualquer** token com o termo, e um token genérico bastava.
describe("relevância: token genérico não sustenta candidato (§9.64)", () => {
  it("não consulta item que casa só por palavra sem poder discriminante", async () => {
    const urls: string[] = [];
    mockPncp({
      processos: [processoPadrao],
      itens: [
        itemDe({ numeroItem: 1, descricao: "Lavagem de fachada com pastilhas" }),
        // O caso real: entrou na série de preços por causa de "novo".
        itemDe({ numeroItem: 2, descricao: "Argamassa colante para assentamento novo" }),
        itemDe({ numeroItem: 3, descricao: "Abraçadeira de nylon, material plástico" }),
      ],
      onUrl: (u) => urls.push(u),
    });

    await buscarContratosPNCP("lavagem fachada predio novo pastilhas pele de vidro");

    const consultados = urls.filter((u) => u.includes("/resultados"));
    expect(consultados).toHaveLength(1);
    expect(consultados[0]).toContain("/itens/1/resultados");
  });

  it("mantém o item quando a palavra genérica vem acompanhada de token real", async () => {
    const urls: string[] = [];
    mockPncp({
      processos: [processoPadrao],
      itens: [itemDe({ numeroItem: 4, descricao: "Material de limpeza — detergente neutro" })],
      onUrl: (u) => urls.push(u),
    });

    // "material" sai do termo, "limpeza" fica e sustenta o casamento sozinha.
    await buscarContratosPNCP("material de limpeza");

    expect(urls.some((u) => u.includes("/itens/4/resultados"))).toBe(true);
  });
});

// Cada item relevante custa uma requisição a `/resultados` e o teto por compra é
// MAX_ITENS_RELEVANTES_POR_COMPRA (10): a ordem define em que itens o orçamento
// é gasto. Antes era a ordem do edital, que não tem relação com a busca.
describe("relevância: ranqueamento decide o gasto do orçamento", () => {
  /** 10 itens que casam só pelo token comum, mais um, no fim, que casa por inteiro. */
  function compraCom11Itens() {
    const genericos = Array.from({ length: 10 }, (_, i) =>
      itemDe({ numeroItem: i + 1, descricao: "Cadeira fixa de plástico" }),
    );
    return [...genericos, itemDe({ numeroItem: 11, descricao: "Cadeira giratória ergonômica" })];
  }

  it("consulta o item mais aderente mesmo quando ele é o último da compra", async () => {
    const urls: string[] = [];
    mockPncp({
      processos: [processoPadrao],
      itens: compraCom11Itens(),
      onUrl: (u) => urls.push(u),
    });

    await buscarContratosPNCP("cadeira giratoria");

    const consultados = urls.filter((u) => u.includes("/resultados"));
    // O teto por compra continua valendo: 11 casam, MAX_ITENS_RELEVANTES_POR_COMPRA
    // (4) são consultados. É justamente por o teto ser apertado que a ORDEM
    // importa — com 4 vagas, o item aderente tem de estar entre elas.
    expect(consultados).toHaveLength(4);
    // O item 11 casa "cadeira" + "giratoria"; os outros só "cadeira".
    expect(consultados[0]).toContain("/itens/11/resultados");
  });

  it("empate preserva a ordem do edital, para a escolha ser determinística", async () => {
    const urls: string[] = [];
    mockPncp({
      processos: [processoPadrao],
      itens: [
        itemDe({ numeroItem: 5, descricao: "Cadeira giratória" }),
        itemDe({ numeroItem: 6, descricao: "Cadeira giratória" }),
        itemDe({ numeroItem: 7, descricao: "Cadeira giratória" }),
      ],
      onUrl: (u) => urls.push(u),
    });

    await buscarContratosPNCP("cadeira giratoria");

    const consultados = urls.filter((u) => u.includes("/resultados"));
    expect(consultados.map((u) => u.match(/\/itens\/(\d+)\/resultados/)?.[1])).toEqual([
      "5",
      "6",
      "7",
    ]);
  });
});

describe("limpeza da descrição do item", () => {
  it("remove HTML e entidades da descrição do item", async () => {
    mockPncp({
      processos: [processoPadrao],
      itens: [
        itemDe({
          descricao: "CADEIRA GIRATÓRIA\r\n<p>com bra&#231;o &#8211; modelo executivo</p>",
        }),
      ],
    });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado[0]?.fonteDescricao).toBe("CADEIRA GIRATÓRIA com braço – modelo executivo");
    expect(resultado[0]?.fonteDescricao).not.toContain("<p>");
    expect(resultado[0]?.fonteDescricao).not.toContain("&#");
  });
});

// PNCP não tem parâmetro de faixa de valor em nenhum endpoint usado aqui; o
// filtro é aplicado no lado da aplicação, sobre o preço já homologado.
describe("filtro de valor (valorMinimo/valorMaximo)", () => {
  it("mantém só candidatos dentro da faixa [min, max]", async () => {
    mockPncp({
      processos: [processoPadrao],
      resultados: [resultadoDe({ valorUnitarioHomologado: 20 })],
    });

    const dentro = await buscarContratosPNCP("cadeira", { valorMinimo: 18, valorMaximo: 25 });
    expect(dentro).toHaveLength(1);

    const fora = await buscarContratosPNCP("cadeira", { valorMinimo: 30, valorMaximo: 40 });
    expect(fora).toEqual([]);
  });

  it("aceita só valorMinimo (sem teto)", async () => {
    mockPncp({
      processos: [processoPadrao],
      resultados: [resultadoDe({ valorUnitarioHomologado: 20 })],
    });

    const abaixo = await buscarContratosPNCP("cadeira", { valorMinimo: 25 });
    expect(abaixo).toEqual([]);

    const acima = await buscarContratosPNCP("cadeira", { valorMinimo: 15 });
    expect(acima).toHaveLength(1);
  });

  it("aceita só valorMaximo (sem piso)", async () => {
    mockPncp({
      processos: [processoPadrao],
      resultados: [resultadoDe({ valorUnitarioHomologado: 20 })],
    });

    const acima = await buscarContratosPNCP("cadeira", { valorMaximo: 15 });
    expect(acima).toEqual([]);

    const abaixo = await buscarContratosPNCP("cadeira", { valorMaximo: 25 });
    expect(abaixo).toHaveLength(1);
  });

  it("inclui os limites da faixa (comparação inclusiva)", async () => {
    mockPncp({
      processos: [processoPadrao],
      resultados: [resultadoDe({ valorUnitarioHomologado: 25 })],
    });

    const resultado = await buscarContratosPNCP("cadeira", { valorMinimo: 18, valorMaximo: 25 });
    expect(resultado).toHaveLength(1);
  });

  it("sem filtro, comportamento é idêntico ao atual", async () => {
    mockPncp({
      processos: [processoPadrao],
      resultados: [resultadoDe({ valorUnitarioHomologado: 999 })],
    });

    const resultado = await buscarContratosPNCP("cadeira");
    expect(resultado).toHaveLength(1);
  });
});

// Testes de conformidade (CLAUDE.md §9.8 e §9.9). Devem falhar se as regras forem removidas.
describe("conformidade da evidência PNCP", () => {
  const CNPJ_PROPRIO = "49203409000102";

  function processoDe(orgaoCnpj: string, nome = "Órgão Externo") {
    // numero_controle_pncp derivado do CNPJ para que cada órgão gere um ID
    // único — deduplicação por esse campo descartaria todos os que viessem
    // depois do primeiro se o campo fosse constante.
    return {
      numero_controle_pncp: `${orgaoCnpj}-1-000123/2026`,
      orgao_nome: nome,
      orgao_cnpj: orgaoCnpj,
      ano: "2026",
      numero_sequencial: "123",
    };
  }

  it("gera a URL do edital no formato /app/editais/{cnpj}/{ano}/{sequencial}", async () => {
    mockPncp({ processos: [processoDe("12345678000199")] });

    const resultado = await buscarContratosPNCP("cadeira");

    // Formato exato: o portal PNCP retorna erro para /app/editais/{numero_controle_pncp},
    // e link inválido invalida a evidência para instrução processual.
    expect(resultado[0]?.fonteUrl).toBe("https://pncp.gov.br/app/editais/12345678000199/2026/123");
  });

  it("exclui contratações do próprio órgão dos candidatos de similaridade", async () => {
    mockPncp({ processos: [processoDe(CNPJ_PROPRIO, "Câmara Municipal de Santos")] });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado).toEqual([]);
  });

  it("exclui o próprio órgão mesmo quando a API devolve o CNPJ com máscara", async () => {
    mockPncp({ processos: [processoDe("49.203.409/0001-02", "Câmara Municipal de Santos")] });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado).toEqual([]);
  });

  it("respeita ORGAO_CNPJ do ambiente, com ou sem máscara", async () => {
    vi.stubEnv("ORGAO_CNPJ", "12.345.678/0001-99");
    mockPncp({ processos: [processoDe("12345678000199")] });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado).toEqual([]);
    vi.unstubAllEnvs();
  });

  it("mantém contratações de outros órgãos no resultado", async () => {
    mockPncp({
      processos: [processoDe("12345678000199", "Prefeitura de Outra Cidade")],
      resultados: [resultadoDe({ valorUnitarioHomologado: 250.5 })],
    });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      fonteOrgaoOuId: "Prefeitura de Outra Cidade",
      valorUnitario: 250.5,
    });
  });

  it("avisa uma única vez quando cai no CNPJ padrão por falta de ORGAO_CNPJ", async () => {
    // Módulo recarregado do zero: a flag de aviso deste caso não depende de nada
    // que os testes anteriores tenham disparado.
    vi.resetModules();
    vi.stubEnv("ORGAO_CNPJ", "");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockPncp({ processos: [processoDe("12345678000199", "Prefeitura A")] });

    const { buscarContratosPNCP: buscar } = await import("../pncp");
    await buscar("cadeira");
    await buscar("mesa");
    await buscar("armário");

    const avisos = warnSpy.mock.calls.filter((args) => String(args[0]).includes("ORGAO_CNPJ"));
    expect(avisos).toHaveLength(1);

    // O log precisa explicar a consequência, não só a variável faltando.
    const mensagem = String(avisos[0]?.[0]);
    expect(mensagem).toContain(CNPJ_PROPRIO);
    expect(mensagem).toContain("IN 65/2021");
  });

  it("não avisa quando ORGAO_CNPJ está definida", async () => {
    vi.resetModules();
    vi.stubEnv("ORGAO_CNPJ", "12.345.678/0001-99");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockPncp({ processos: [processoDe("12345678000199", "Prefeitura A")] });

    const { buscarContratosPNCP: buscar } = await import("../pncp");
    const resultado = await buscar("cadeira");

    // Confirma que o caminho do fallback realmente não foi tomado: o CNPJ do
    // ambiente é o que filtra, e nenhum aviso foi emitido.
    expect(resultado).toEqual([]);
    const avisos = warnSpy.mock.calls.filter((args) => String(args[0]).includes("ORGAO_CNPJ"));
    expect(avisos).toHaveLength(0);
  });

  it("filtra apenas o próprio órgão quando o resultado mistura órgãos", async () => {
    mockPncp({
      processos: [
        processoDe("12345678000199", "Prefeitura A"),
        processoDe(CNPJ_PROPRIO, "Câmara Municipal de Santos"),
        processoDe("98765432000188", "Prefeitura B"),
      ],
    });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado.map((c) => c.fonteOrgaoOuId)).toEqual(["Prefeitura A", "Prefeitura B"]);
  });
});

// ---------------------------------------------------------------------------
// Tetos de tempo (CLAUDE.md §9.64).
//
// Medido contra a API real em 2026-08-10: um termo longo gastou 11s e 82
// requisições HTTP com apenas 7 dos 20 editais que a busca textual pode
// devolver. Sem teto, uma única busca estoura o `maxDuration = 60` da rota do
// assistente — e estourar não devolve erro, mata a função no meio do stream.
// ---------------------------------------------------------------------------

describe("tetos de tempo", () => {
  it("passa um AbortSignal em toda requisição, para não herdar os 300s do undici", async () => {
    const spy = mockPncp({ processos: [processoPadrao] });

    await buscarContratosPNCP("cadeira");

    expect(spy.mock.calls.length).toBeGreaterThan(0);
    for (const [, init] of spy.mock.calls) {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("para de ler editais ao atingir o teto de tempo, devolvendo o que já achou", async () => {
    const processos = Array.from({ length: 12 }, (_, i) => ({
      ...processoPadrao,
      numero_controle_pncp: `ctrl-${i}`,
      numero_sequencial: String(i + 1),
    }));

    let relogio = 0;
    vi.spyOn(Date, "now").mockImplementation(() => relogio);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Cada requisição "gasta" 900ms. As duas buscas textuais em paralelo custam
    // 1,8s (2 × 900ms). O primeiro lote de 5 editais custa mais 9s
    // (5 páginas + 5 resultados × 900ms) → 10,8s total, dentro dos 12s.
    // O segundo lote não tem a reserva mínima de 2s para começar (1,2s restantes).
    // Nota: 1000ms por requisição não funciona mais — com 2 buscas textuais o
    // primeiro lote chegaria a exatamente 12s, e ctx.vencido() descartaria os
    // resultados do próprio primeiro lote (12000 ≥ 12000).
    mockPncp({
      processos,
      onUrl: () => {
        relogio += 900;
      },
    });

    const resultado = await buscarContratosPNCP("cadeira");

    // Só o primeiro lote entrou; sem o teto seriam os 12 editais.
    expect(resultado).toHaveLength(5);
    // Truncar em silêncio esconderia uma busca incompleta atrás de um resultado
    // que parece completo — o corte precisa deixar rastro no log.
    const avisos = warnSpy.mock.calls.filter((args) => String(args[0]).includes("Teto de tempo"));
    expect(avisos).toHaveLength(1);
  });

  it("não começa um lote que não caberia na reserva mínima de tempo", async () => {
    const processos = Array.from({ length: 12 }, (_, i) => ({
      ...processoPadrao,
      numero_controle_pncp: `ctrl-${i}`,
      numero_sequencial: String(i + 1),
    }));

    let relogio = 0;
    vi.spyOn(Date, "now").mockImplementation(() => relogio);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const urls: string[] = [];
    // 11,4s consumidos no primeiro lote (2 buscas textuais + 5 páginas + 5 resultados):
    // sobra 0,6s, abaixo da reserva de 2s. Sem a reserva o segundo lote começaria,
    // pagaria 5 requisições de página e seria descartado inteiro pelo prazo.
    mockPncp({
      processos,
      onUrl: (u) => {
        urls.push(u);
        relogio += 950;
      },
    });

    await buscarContratosPNCP("cadeira");

    // 2 buscas textuais + 5 páginas + 5 resultados = 12 requisições. Nenhuma do
    // segundo lote (que começaria pedindo /itens de ctrl-5).
    expect(urls).toHaveLength(12);
    expect(urls.some((u) => u.includes("/compras/2026/6/itens"))).toBe(false);
  });

  it("descarta a compra INTEIRA quando o prazo vence no meio dela", async () => {
    let relogio = 0;
    vi.spyOn(Date, "now").mockImplementation(() => relogio);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Página de itens barata; cada resultado custa 5s. O primeiro resultado cabe
    // nos 12s, o segundo estoura — e aí a compra sai inteira, não pela metade.
    mockPncp({
      processos: [processoPadrao],
      itens: [itemDe({ numeroItem: 1 }), itemDe({ numeroItem: 2 })],
      resultados: (numeroItem) => [resultadoDe({ numeroItem })],
      onUrl: (u) => {
        relogio += u.includes("/resultados") ? 5_000 : 1_000;
      },
    });

    const resultado = await buscarContratosPNCP("cadeira");

    // Meia compra seria pior que nenhuma: um recorte arbitrário dos itens vira
    // série de preços enviesada, sem nada na tela indicando que faltou item.
    expect(resultado).toEqual([]);
  });

  it("não gasta consultas de resultado numa compra já truncada na paginação", async () => {
    let relogio = 0;
    vi.spyOn(Date, "now").mockImplementation(() => relogio);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const urls: string[] = [];
    // Página cheia (500) mantém a paginação andando; cada página custa 7s, então
    // o prazo vence com a lista de itens da compra ainda incompleta.
    const paginaCheia = Array.from({ length: 500 }, (_, i) => itemDe({ numeroItem: i + 1 }));
    mockPncp({
      processos: [processoPadrao],
      itens: () => paginaCheia,
      resultados: (numeroItem) => [resultadoDe({ numeroItem })],
      onUrl: (u) => {
        urls.push(u);
        relogio += u.includes("/resultados") ? 1_000 : u.includes("/itens") ? 7_000 : 1_000;
      },
    });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado).toEqual([]);
    // A asserção que importa: a compra é abandonada ANTES de pagar os
    // /resultados. Descartá-la só no fim daria o mesmo resultado vazio depois de
    // gastar 10 requisições do orçamento — o desperdício que o teto existe para
    // evitar.
    expect(urls.some((u) => u.includes("/resultados"))).toBe(false);
  });

  it("aborta as requisições em voo quando o prazo vence", async () => {
    vi.useFakeTimers();
    const sinais = new Map<string, AbortSignal | undefined>();

    // A requisição precisa COMEÇAR tarde para o teste provar alguma coisa: o
    // timeout por requisição é 10s e o prazo da busca é 12s, então uma chamada
    // iniciada em t=0 aborta pelo timeout dela mesma e o teste passaria mesmo
    // sem o prazo composto. Fazendo as duas primeiras custarem 3s cada, a de
    // /resultados começa em t≈6s e só venceria sozinha em t≈16s.
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const etapa = url.includes("/resultados")
        ? "resultados"
        : url.includes("/itens")
          ? "itens"
          : "busca";
      sinais.set(etapa, init?.signal ?? undefined);

      // /resultados nunca resolve: é a requisição pendurada que o prazo corta.
      if (etapa === "resultados") return new Promise<Response>(() => {});

      await new Promise((r) => setTimeout(r, 3_000));
      return etapa === "busca" ? mockBusca([processoPadrao]) : mockJson([itemDe()]);
    });

    void buscarContratosPNCP("cadeira");
    await vi.advanceTimersByTimeAsync(6_500);

    const sinalResultados = sinais.get("resultados");
    expect(sinalResultados).toBeDefined();
    expect(sinalResultados!.aborted).toBe(false);

    // Aos 12s o prazo vence. Como o timeout próprio desta requisição só venceria
    // em ~16s, abortar aqui só pode vir do prazo da busca — que é o que impede a
    // requisição de seguir consumindo o `maxDuration` da função depois do teto.
    await vi.advanceTimersByTimeAsync(6_000);
    expect(sinalResultados!.aborted).toBe(true);

    vi.useRealTimers();
  });

  it("respeita o teto global de consultas a /resultados", async () => {
    // 40 editais é o pool real das duas páginas de busca textual. Com o teto por
    // compra em 4, são necessários mais editais que os 20 de antes para o teto
    // GLOBAL ser o que corta — que é o que este teste existe para provar.
    const processos = Array.from({ length: 40 }, (_, i) => ({
      ...processoPadrao,
      numero_controle_pncp: `ctrl-${i}`,
      numero_sequencial: String(i + 1),
    }));
    // 30 itens relevantes por compra; o teto por compra corta em 4, e o teto
    // global (150) corta quando a próxima compra não cabe inteira.
    const muitosItens = Array.from({ length: 30 }, (_, i) => itemDe({ numeroItem: i + 1 }));

    const urls: string[] = [];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockPncp({
      processos,
      itens: muitosItens,
      resultados: (numeroItem) => [resultadoDe({ numeroItem })],
      onUrl: (u) => urls.push(u),
    });

    await buscarContratosPNCP("cadeira");

    const consultasResultado = urls.filter((u) => u.includes("/resultados"));
    // Sem os dois tetos seriam 40 × 30 = 1200 requisições, numa busca que exibe
    // no máximo 25 candidatos. Com MAX_RESULTADOS_POR_BUSCA = 150 e 4 itens por
    // compra, o orçamento se espalha por 37 editais (148) em vez de se esgotar
    // em 15 — o mesmo custo, distribuído em ~2,5x mais editais.
    //
    // 148 e não 150 porque `reservarResultados` é tudo-ou-nada: a 38ª compra
    // precisaria de 4 e só restam 2, então ela não gasta requisição nenhuma em
    // vez de ser lida pela metade e descartada depois.
    expect(consultasResultado).toHaveLength(148);
    expect(
      warnSpy.mock.calls.some((args) => String(args[0]).includes("Orçamento de resultados")),
    ).toBe(true);
  });

  it("não corta nada quando a busca cabe no teto", async () => {
    const processos = Array.from({ length: 12 }, (_, i) => ({
      ...processoPadrao,
      numero_controle_pncp: `ctrl-${i}`,
      numero_sequencial: String(i + 1),
    }));

    let relogio = 0;
    vi.spyOn(Date, "now").mockImplementation(() => relogio);
    mockPncp({
      processos,
      onUrl: () => {
        relogio += 10;
      },
    });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// Busca textual em duas páginas paralelas (M14.2).
//
// A busca textual do PNCP devolve no máximo TAMANHO_PAGINA (20) editais por
// página. Buscar as páginas 1 e 2 em paralelo dobra o pool para o ranqueador
// por IDF sem custo extra de tempo na parede, já que ambas as requisições
// correm ao mesmo tempo (~2,5s total). O teto MAX_RESULTADOS_POR_BUSCA = 150
// (15 editais) alinha o orçamento de resultados com o que o tempo permite.
// ---------------------------------------------------------------------------

describe("busca textual em duas páginas paralelas", () => {
  it("pede as páginas 1 e 2 da busca textual", async () => {
    const urls: string[] = [];
    mockPncp({ processos: [], onUrl: (u) => urls.push(u) });

    await buscarContratosPNCP("cadeira");

    const urlsBusca = urls.filter((u) => u.includes("/api/search/"));
    expect(urlsBusca).toHaveLength(2);
    expect(urlsBusca.some((u) => u.includes("pagina=1"))).toBe(true);
    expect(urlsBusca.some((u) => u.includes("pagina=2"))).toBe(true);
  });

  it("inclui candidatos exclusivos da página 2", async () => {
    const processoPg2 = {
      ...processoPadrao,
      numero_controle_pncp: "pg2-exclusivo",
      numero_sequencial: "2",
    };
    mockPncp({
      processos: (pagina) => (pagina === 1 ? [processoPadrao] : [processoPg2]),
    });

    const resultado = await buscarContratosPNCP("cadeira");

    // Candidatos de ambas as páginas chegam ao resultado final.
    expect(resultado).toHaveLength(2);
  });

  it("deduplica edital que aparece nas duas páginas", async () => {
    // Improvável na prática, mas defensivo: mesmo edital nas duas páginas não
    // pode gerar dois candidatos distintos para o mesmo item.
    mockPncp({
      processos: (pagina) => (pagina <= 2 ? [processoPadrao] : []),
    });

    const resultado = await buscarContratosPNCP("cadeira");

    // Um único candidato — a deduplicação por numero_controle_pncp funcionou.
    expect(resultado).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Data de referência (CLAUDE.md §9.65).
//
// Medido em produção em 2026-08-11: o PNCP devolve data-sentinela em vez de nulo
// em parte dos resultados — 0001-01-01, 1858-11-17 (epoch do MJD) e 1900-01-01
// (epoch do Excel), em 5 de 264 candidatos. Preço com data falsa não sustenta a
// estimativa da IN 65/2021, e o filtro de recência o descarta em silêncio.
// ---------------------------------------------------------------------------

describe("validação da data de referência", () => {
  it.each(["0001-01-01", "1858-11-17", "1900-01-01", "não é data"])(
    "descarta o candidato quando nenhuma data é plausível (%s)",
    async (dataRuim) => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockPncp({
        processos: [processoPadrao],
        itens: [itemDe({ dataAtualizacao: dataRuim })],
        resultados: [resultadoDe({ dataResultado: dataRuim })],
      });

      const resultado = await buscarContratosPNCP("cadeira");

      expect(resultado).toEqual([]);
      expect(
        warnSpy.mock.calls.some((args) => String(args[0]).includes("data de referência implausível")),
      ).toBe(true);
    },
  );

  it("cai para dataAtualizacao quando só dataResultado é implausível", async () => {
    mockPncp({
      processos: [processoPadrao],
      itens: [itemDe({ dataAtualizacao: "2026-01-10T00:00:00Z" })],
      resultados: [resultadoDe({ dataResultado: "0001-01-01" })],
    });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado).toHaveLength(1);
    expect(resultado[0]!.dataReferencia.toISOString()).toBe("2026-01-10T00:00:00.000Z");
  });

  it("mantém dataResultado quando ela é plausível", async () => {
    mockPncp({ processos: [processoPadrao] });

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado[0]!.dataReferencia.toISOString()).toBe("2026-02-20T00:00:00.000Z");
  });
});

/**
 * Roteia `/itens` e `/itens/{n}/resultados` para `listarItensDaCompraPNCP` —
 * diferente de `mockPncp`, não há fase de busca textual (a contratação já
 * chega identificada por cnpj/ano/sequencial).
 */
function mockItensDaCompra(opcoes: {
  itens?: unknown[];
  resultados?: (numeroItem: number) => unknown[];
}) {
  const { itens = [itemDe()], resultados = () => [resultadoDe()] } = opcoes;

  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/resultados")) {
      const numeroItem = Number(url.match(/\/itens\/(\d+)\/resultados/)?.[1] ?? 0);
      return mockJson(resultados(numeroItem));
    }
    if (url.includes("/itens")) {
      const pagina = Number(new URL(url).searchParams.get("pagina") ?? 1);
      return mockJson(pagina === 1 ? itens : []);
    }
    throw new Error(`URL inesperada: ${url}`);
  });
}

const identidadePadrao = { cnpjOrgao: "00000000000100", ano: "2026", numeroSequencial: "1" };

describe("listarItensDaCompraPNCP", () => {
  it("lista os itens homologados de uma contratação já identificada", async () => {
    mockItensDaCompra({});

    const { candidatos, completo } = await listarItensDaCompraPNCP(identidadePadrao, "Prefeitura Teste");

    expect(completo).toBe(true);
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0]).toMatchObject({
      tipoCandidato: "contratacao_publica",
      fonteDescricao: "Cadeira de escritório",
      fonteOrgaoOuId: "Prefeitura Teste",
      valorUnitario: 100,
    });
  });

  // O nome do órgão não vem do endpoint de itens — só cnpj. Sem isto o
  // candidato entraria na estimativa com o órgão em branco.
  it("usa o orgaoNome recebido, não um valor derivado do CNPJ", async () => {
    mockItensDaCompra({});

    const { candidatos } = await listarItensDaCompraPNCP(identidadePadrao, "Órgão Informado");

    expect(candidatos[0]!.fonteOrgaoOuId).toBe("Órgão Informado");
  });

  it("preenche identidadeContratacao com o numeroItem de cada item", async () => {
    mockItensDaCompra({
      itens: [itemDe({ numeroItem: 1 }), itemDe({ numeroItem: 2 })],
      resultados: (numeroItem) => [resultadoDe({ numeroItem })],
    });

    const { candidatos } = await listarItensDaCompraPNCP(identidadePadrao, "Prefeitura Teste");

    expect(candidatos.map((c) => c.identidadeContratacao?.numeroItem).sort()).toEqual([1, 2]);
  });

  // Mesma regra de preço das demais buscas do PNCP: nunca o valor estimado.
  it("descarta item sem valor homologado", async () => {
    mockItensDaCompra({ resultados: () => [resultadoDe({ valorUnitarioHomologado: null })] });

    const { candidatos } = await listarItensDaCompraPNCP(identidadePadrao, "Prefeitura Teste");

    expect(candidatos).toEqual([]);
  });

  it("devolve completo:false quando a paginação de /itens não termina antes do prazo", async () => {
    let relogio = 0;
    vi.spyOn(Date, "now").mockImplementation(() => relogio);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Página cheia (500) mantém a paginação andando; cada página custa 7s, então
    // o prazo (12s) vence com a lista de itens ainda incompleta.
    const paginaCheia = Array.from({ length: 500 }, (_, i) => itemDe({ numeroItem: i + 1 }));
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      relogio += url.includes("/resultados") ? 1_000 : 7_000;
      if (url.includes("/itens")) return mockJson(paginaCheia);
      throw new Error(`URL inesperada: ${url}`);
    });

    const { candidatos, completo } = await listarItensDaCompraPNCP(identidadePadrao, "Prefeitura Teste");

    expect(completo).toBe(false);
    expect(candidatos).toEqual([]);
  });
});
