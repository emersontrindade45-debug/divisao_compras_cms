import { describe, it, expect, vi, afterEach } from "vitest";
import { consultarSancoesCnpj } from "../portalTransparencia";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/**
 * Registro como o CEIS/CNEP devolve — campos confirmados contra o OpenAPI
 * real (`/v3/api-docs` de `api.portaldatransparencia.gov.br`) em 2026-08-07,
 * mas o CONTEÚDO deste fixture (fornecedor, órgão, sanção) é MOCK — não
 * validado contra a API ao vivo, porque este ambiente não tem um token de
 * produção do Portal da Transparência (ver limitação documentada no cabeçalho
 * de `portalTransparencia.ts`). A API rejeita qualquer chamada sem token
 * válido, então não há como confirmar um caso de fornecedor sancionado real
 * sem essa credencial.
 */
function sancaoDe(over: Record<string, unknown> = {}) {
  return {
    id: 123456,
    dataInicioSancao: "2024-03-01",
    dataFimSancao: "2026-03-01",
    dataPublicacaoSancao: "2024-03-05",
    tipoSancao: {
      descricaoResumida: "Suspensão temporária de participação em licitação",
      descricaoPortal: "Suspensão temporária",
    },
    fundamentacao: [{ codigo: "Art. 87, III", descricao: "Lei 8.666/93" }],
    orgaoSancionador: { nome: "Prefeitura Municipal Exemplo", siglaUf: "SP" },
    sancionado: { nome: "Fornecedora Sancionada Exemplo LTDA", codigoFormatado: "12.345.678/0001-99" },
    textoPublicacao: "Portaria nº 42/2024",
    linkPublicacao: "https://exemplo.gov.br/portaria-42-2024",
    numeroProcesso: "2024.001234",
    ...over,
  };
}

function mockResposta(corpo: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => corpo } as Response;
}

describe("consultarSancoesCnpj — guarda de token (fail-closed)", () => {
  // Mutação inversa da §9.45: este é o caso que, se a guarda voltasse a ser
  // `if (token && ...)`, passaria a chamar `fetch` mesmo sem token — a
  // asserção `not.toHaveBeenCalled()` cairia exatamente nesse cenário.
  it("nega a consulta quando PORTAL_TRANSPARENCIA_TOKEN não está configurado", async () => {
    vi.stubEnv("PORTAL_TRANSPARENCIA_TOKEN", "");
    const fetchSpy = vi.spyOn(global, "fetch");

    const resultado = await consultarSancoesCnpj("12345678000199");

    expect(resultado.negada).toBe(true);
    if (resultado.negada) {
      expect(resultado.motivo).toContain("PORTAL_TRANSPARENCIA_TOKEN");
    }
    // A negação acontece ANTES de qualquer chamada de rede — token ausente
    // nunca deve custar uma requisição.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("nunca retorna 'negada: false' sem token — não confunde ausência de token com 'sem sanção'", async () => {
    vi.stubEnv("PORTAL_TRANSPARENCIA_TOKEN", "");

    const resultado = await consultarSancoesCnpj("12345678000199");

    // A garantia central da §9.45: consulta negada é um resultado DISTINTO de
    // "consultei e não achei nada" — nunca aparece como sancoes: [].
    expect(resultado).not.toEqual({ negada: false, sancoes: [] });
    expect(resultado.negada).toBe(true);
  });

  it("com token configurado, envia o header chave-api-dados e consulta CEIS e CNEP", async () => {
    vi.stubEnv("PORTAL_TRANSPARENCIA_TOKEN", "token-de-teste");
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(mockResposta([]));

    const resultado = await consultarSancoesCnpj("12.345.678/0001-99");

    expect(resultado.negada).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // CEIS + CNEP em paralelo
    for (const chamada of fetchSpy.mock.calls) {
      const [url, init] = chamada as [string, RequestInit];
      expect(url).toContain("api.portaldatransparencia.gov.br/api-de-dados/");
      expect(url).toContain("codigoSancionado=12345678000199"); // sem máscara
      expect((init.headers as Record<string, string>)["chave-api-dados"]).toBe("token-de-teste");
    }
  });

  it("detecta um fornecedor sancionado (fixture MOCK, não validado contra API real)", async () => {
    vi.stubEnv("PORTAL_TRANSPARENCIA_TOKEN", "token-de-teste");
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/ceis")) return mockResposta([sancaoDe()]);
      return mockResposta([]);
    });

    const resultado = await consultarSancoesCnpj("12345678000199");

    expect(resultado.negada).toBe(false);
    if (!resultado.negada) {
      expect(resultado.sancoes).toHaveLength(1);
      expect(resultado.sancoes[0]).toMatchObject({
        origem: "CEIS",
        tipoSancao: "Suspensão temporária de participação em licitação",
        orgaoSancionador: "Prefeitura Municipal Exemplo",
      });
    }
  });

  it("nega e sinaliza quando o token é inválido (HTTP 401)", async () => {
    vi.stubEnv("PORTAL_TRANSPARENCIA_TOKEN", "token-invalido");
    vi.spyOn(global, "fetch").mockResolvedValue(mockResposta({ "Erro na API": "Chave de API inválida!" }, false, 401));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const resultado = await consultarSancoesCnpj("12345678000199");

    expect(resultado.negada).toBe(true);
  });

  it("rejeita CNPJ com formato inválido antes de consultar a rede", async () => {
    vi.stubEnv("PORTAL_TRANSPARENCIA_TOKEN", "token-de-teste");
    const fetchSpy = vi.spyOn(global, "fetch");

    const resultado = await consultarSancoesCnpj("123");

    expect(resultado.negada).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
