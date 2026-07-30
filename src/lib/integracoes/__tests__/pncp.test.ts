import { describe, it, expect, vi, afterEach } from "vitest";
import { buscarContratosPNCP } from "../pncp";

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
 */
function mockPncp(opcoes: {
  processos: unknown[];
  itens?: unknown[] | ((pagina: number) => unknown[]);
  resultados?: unknown[] | ((numeroItem: number) => unknown[]);
  onUrl?: (url: string) => void;
}) {
  const { processos, itens = [itemDe()], resultados = [resultadoDe()], onUrl } = opcoes;

  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    onUrl?.(url);

    if (url.includes("/api/search/")) return mockBusca(processos);

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

    expect(chamadasBusca).toBe(2);
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
    expect(fetchSpy).toHaveBeenCalledTimes(3);
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

// Testes de conformidade (CLAUDE.md §9.8 e §9.9). Devem falhar se as regras forem removidas.
describe("conformidade da evidência PNCP", () => {
  const CNPJ_PROPRIO = "49203409000102";

  function processoDe(orgaoCnpj: string, nome = "Órgão Externo") {
    return {
      numero_controle_pncp: "12345678000199-1-000123/2026",
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
