import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buscarWebPerplexity,
  montarFiltroDominios,
  perplexityConfigurada,
  PerplexityNaoConfiguradaError,
  MAX_DOMINIOS_FILTRO,
} from "../perplexity";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Resposta mínima no formato documentado da API Sonar. */
function respostaOk(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      model: "sonar-pro",
      choices: [{ message: { content: "Encontrei 2 atas de registro de preços." } }],
      search_results: [
        {
          title: "ARP 55/2025 — Prefeitura de Campinas",
          url: "https://campinas.sp.gov.br/arp-55-2025",
          snippet: "Registro de preços para mobiliário técnico",
          date: "2025-11-03",
        },
      ],
      citations: ["https://campinas.sp.gov.br/arp-55-2025"],
      ...overrides,
    }),
  } as Response;
}

/** Captura o corpo enviado para inspecionar os parâmetros de conformidade. */
function espionarFetch(resposta: Response) {
  const capturado: { corpo?: Record<string, unknown> } = {};
  vi.spyOn(global, "fetch").mockImplementation(async (_input, init) => {
    capturado.corpo = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return resposta;
  });
  return capturado;
}

describe("perplexityConfigurada", () => {
  it("é falso sem a variável de ambiente", () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "");
    expect(perplexityConfigurada()).toBe(false);
  });

  it("é falso quando a variável só tem espaços", () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "   ");
    expect(perplexityConfigurada()).toBe(false);
  });

  it("é verdadeiro com a chave definida", () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "pplx-abc");
    expect(perplexityConfigurada()).toBe(true);
  });
});

describe("montarFiltroDominios", () => {
  it("envia a lista branca sem prefixo e a vermelha com '-'", () => {
    const filtro = montarFiltroDominios(["gov.br"], ["mercadolivre.com.br"]);
    expect(filtro).toEqual(["gov.br", "-mercadolivre.com.br"]);
  });

  it("normaliza caixa, espaços e duplicatas", () => {
    const filtro = montarFiltroDominios([" GOV.BR ", "gov.br", "sp.gov.br"], []);
    expect(filtro).toEqual(["gov.br", "sp.gov.br"]);
  });

  it("respeita o teto de 20 entradas da API", () => {
    const muitos = Array.from({ length: 30 }, (_, i) => `orgao${i}.gov.br`);
    const filtro = montarFiltroDominios(muitos, ["marketplace.com"]);
    expect(filtro).toHaveLength(MAX_DOMINIOS_FILTRO);
  });

  it("prioriza a lista branca quando o teto é atingido", () => {
    const muitos = Array.from({ length: MAX_DOMINIOS_FILTRO }, (_, i) => `orgao${i}.gov.br`);
    const filtro = montarFiltroDominios(muitos, ["marketplace.com"]);
    // Nenhuma vaga sobrou para a denylist — restringir a domínios confiáveis é
    // mais forte que excluir alguns ruins, e a lista vermelha é reaplicada em
    // código sobre os resultados.
    expect(filtro.some((d) => d.startsWith("-"))).toBe(false);
  });

  it("não devolve filtro algum quando não há domínios", () => {
    expect(montarFiltroDominios()).toEqual([]);
  });
});

describe("buscarWebPerplexity", () => {
  it("falha com erro tipado quando a chave não está configurada", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "");
    await expect(buscarWebPerplexity("cadeira")).rejects.toBeInstanceOf(
      PerplexityNaoConfiguradaError,
    );
  });

  it("mapeia search_results para ResultadoWeb com data parseada", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "pplx-abc");
    espionarFetch(respostaOk());

    const res = await buscarWebPerplexity("arquivo deslizante");

    expect(res.resumo).toContain("atas de registro");
    expect(res.resultados).toHaveLength(1);
    expect(res.resultados[0]).toMatchObject({
      titulo: "ARP 55/2025 — Prefeitura de Campinas",
      url: "https://campinas.sp.gov.br/arp-55-2025",
      trecho: "Registro de preços para mobiliário técnico",
    });
    expect(res.resultados[0]!.dataPublicacao?.getUTCFullYear()).toBe(2025);
  });

  // Janela de 365 dias da IN 65/2021 aplicada já na chamada da API.
  it("restringe a busca ao último ano por padrão", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "pplx-abc");
    const capturado = espionarFetch(respostaOk());

    await buscarWebPerplexity("cadeira");

    expect(capturado.corpo?.search_recency_filter).toBe("year");
  });

  it("envia o filtro de domínios quando há listas branca e vermelha", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "pplx-abc");
    const capturado = espionarFetch(respostaOk());

    await buscarWebPerplexity("cadeira", {
      dominiosPermitidos: ["pncp.gov.br"],
      dominiosBloqueados: ["mercadolivre.com.br"],
    });

    expect(capturado.corpo?.search_domain_filter).toEqual([
      "pncp.gov.br",
      "-mercadolivre.com.br",
    ]);
  });

  it("omite o filtro de domínios quando não há nenhum — array vazio zeraria a busca", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "pplx-abc");
    const capturado = espionarFetch(respostaOk());

    await buscarWebPerplexity("cadeira");

    expect(capturado.corpo).not.toHaveProperty("search_domain_filter");
  });

  it("degrada para citations quando a API não devolve search_results", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "pplx-abc");
    espionarFetch(
      respostaOk({ search_results: undefined, citations: ["https://exemplo.gov.br/ata"] }),
    );

    const res = await buscarWebPerplexity("cadeira");

    expect(res.resultados).toEqual([
      { titulo: "https://exemplo.gov.br/ata", url: "https://exemplo.gov.br/ata" },
    ]);
  });

  it("não duplica uma URL presente em search_results e em citations", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "pplx-abc");
    espionarFetch(respostaOk());

    const res = await buscarWebPerplexity("cadeira");

    const urls = res.resultados.map((r) => r.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("ignora data impossível em vez de devolver Invalid Date", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "pplx-abc");
    espionarFetch(
      respostaOk({
        search_results: [{ title: "X", url: "https://x.gov.br", date: "data-invalida" }],
        citations: undefined,
      }),
    );

    const res = await buscarWebPerplexity("cadeira");

    expect(res.resultados[0]!.dataPublicacao).toBeUndefined();
  });

  // CLAUDE.md §9.12 — resposta de IA nunca é consumida sem parsing defensivo.
  it("rejeita resposta que não corresponde ao schema", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "pplx-abc");
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: "isto deveria ser um array" }),
    } as Response);

    await expect(buscarWebPerplexity("cadeira")).rejects.toThrow(/fora do formato esperado/i);
  });

  it("propaga erro HTTP não-retryável com o status", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "pplx-abc");
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid api key",
    } as Response);

    await expect(buscarWebPerplexity("cadeira")).rejects.toThrow(/401/);
  });

  it("registra o instante da busca, que não serve como data de acesso da evidência", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "pplx-abc");
    espionarFetch(respostaOk());

    const antes = Date.now();
    const res = await buscarWebPerplexity("cadeira");

    expect(res.buscadoEm.getTime()).toBeGreaterThanOrEqual(antes);
  });
});
