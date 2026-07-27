import { describe, it, expect, afterEach, vi } from "vitest";
import {
  dominioCasa,
  extrairDominio,
  filtrarResultadosWeb,
  resumirDescartes,
} from "../guardas";
import type { ResultadoWeb } from "@/lib/integracoes/perplexity";

const CNPJ_PROPRIO = "49203409000102";

afterEach(() => {
  vi.unstubAllEnvs();
});

function web(overrides: Partial<ResultadoWeb> = {}): ResultadoWeb {
  return {
    titulo: "Ata de registro de preços 55/2025",
    url: "https://campinas.sp.gov.br/arp-55-2025",
    trecho: "Mobiliário técnico para arquivo",
    ...overrides,
  };
}

describe("extrairDominio", () => {
  it("extrai o host e remove www.", () => {
    expect(extrairDominio("https://www.pncp.gov.br/app/editais/1")).toBe("pncp.gov.br");
  });

  it("normaliza a caixa do host", () => {
    expect(extrairDominio("https://PNCP.GOV.BR/x")).toBe("pncp.gov.br");
  });

  it("devolve null para URL inválida", () => {
    expect(extrairDominio("não é uma url")).toBeNull();
  });
});

describe("dominioCasa", () => {
  it("casa o domínio exato", () => {
    expect(dominioCasa("mercadolivre.com.br", "mercadolivre.com.br")).toBe(true);
  });

  it("casa subdomínio", () => {
    expect(dominioCasa("produto.mercadolivre.com.br", "mercadolivre.com.br")).toBe(true);
  });

  // Sem exigir o ponto separador, bloquear "livre.com" derrubaria
  // "mercadolivre.com", que é outro site.
  it("não casa por sufixo textual sem fronteira de domínio", () => {
    expect(dominioCasa("mercadolivre.com", "livre.com")).toBe(false);
  });

  it("ignora www. e caixa no padrão", () => {
    expect(dominioCasa("amazon.com.br", "WWW.Amazon.com.br")).toBe(true);
  });

  it("padrão vazio não casa com nada", () => {
    expect(dominioCasa("qualquer.com", "   ")).toBe(false);
  });
});

describe("filtrarResultadosWeb", () => {
  it("mantém resultado legítimo de portal público", () => {
    vi.stubEnv("ORGAO_CNPJ", CNPJ_PROPRIO);
    const { mantidos, descartados } = filtrarResultadosWeb([web()], ["mercadolivre.com.br"]);

    expect(mantidos).toHaveLength(1);
    expect(descartados).toHaveLength(0);
  });

  // IN 65/2021 / CLAUDE.md §9.9 — contrato do próprio órgão não é referência de
  // preço para a própria renovação.
  it("descarta resultado cuja URL carrega o CNPJ do próprio órgão", () => {
    vi.stubEnv("ORGAO_CNPJ", CNPJ_PROPRIO);
    const resultado = web({
      url: `https://pncp.gov.br/app/editais/${CNPJ_PROPRIO}/2025/1`,
    });

    const { mantidos, descartados } = filtrarResultadosWeb([resultado]);

    expect(mantidos).toHaveLength(0);
    expect(descartados[0]?.motivo).toBe("orgao_proprio");
  });

  it("descarta quando o CNPJ próprio aparece mascarado no texto", () => {
    vi.stubEnv("ORGAO_CNPJ", CNPJ_PROPRIO);
    const resultado = web({
      url: "https://exemplo.gov.br/ata",
      trecho: "Contratante: Câmara Municipal de Santos, CNPJ 49.203.409/0001-02",
    });

    const { descartados } = filtrarResultadosWeb([resultado]);

    expect(descartados[0]?.motivo).toBe("orgao_proprio");
  });

  it("descarta domínio da lista vermelha, inclusive em subdomínio", () => {
    vi.stubEnv("ORGAO_CNPJ", CNPJ_PROPRIO);
    const resultado = web({ url: "https://produto.mercadolivre.com.br/cadeira" });

    const { mantidos, descartados } = filtrarResultadosWeb([resultado], [
      "mercadolivre.com.br",
    ]);

    expect(mantidos).toHaveLength(0);
    expect(descartados[0]?.motivo).toBe("dominio_bloqueado");
  });

  it("descarta URL inválida em vez de deixar passar sem checagem de domínio", () => {
    vi.stubEnv("ORGAO_CNPJ", CNPJ_PROPRIO);
    const { mantidos, descartados } = filtrarResultadosWeb([web({ url: "javascript:void" })]);

    expect(mantidos).toHaveLength(0);
    expect(descartados[0]?.motivo).toBe("url_invalida");
  });

  it("aplica a exclusão do órgão próprio antes da lista de domínios", () => {
    vi.stubEnv("ORGAO_CNPJ", CNPJ_PROPRIO);
    const resultado = web({
      url: `https://mercadolivre.com.br/${CNPJ_PROPRIO}`,
    });

    const { descartados } = filtrarResultadosWeb([resultado], ["mercadolivre.com.br"]);

    expect(descartados[0]?.motivo).toBe("orgao_proprio");
  });

  it("separa mantidos e descartados numa lista mista", () => {
    vi.stubEnv("ORGAO_CNPJ", CNPJ_PROPRIO);
    const entrada = [
      web({ url: "https://campinas.sp.gov.br/arp" }),
      web({ url: "https://mercadolivre.com.br/x" }),
      web({ url: `https://pncp.gov.br/app/editais/${CNPJ_PROPRIO}/2025/1` }),
    ];

    const { mantidos, descartados } = filtrarResultadosWeb(entrada, ["mercadolivre.com.br"]);

    expect(mantidos).toHaveLength(1);
    expect(descartados).toHaveLength(2);
  });

  it("sem lista de bloqueio, ainda aplica a exclusão do órgão próprio", () => {
    vi.stubEnv("ORGAO_CNPJ", CNPJ_PROPRIO);
    const { descartados } = filtrarResultadosWeb([
      web({ url: `https://x.gov.br/${CNPJ_PROPRIO}` }),
    ]);

    expect(descartados).toHaveLength(1);
  });

  it("usa o CNPJ configurado no ambiente, não um fixo", () => {
    vi.stubEnv("ORGAO_CNPJ", "11222333000181");
    const outroOrgao = web({ url: "https://pncp.gov.br/app/editais/11222333000181/2025/1" });

    const { descartados } = filtrarResultadosWeb([outroOrgao]);

    expect(descartados[0]?.motivo).toBe("orgao_proprio");
  });
});

describe("resumirDescartes", () => {
  it("não diz nada quando nada foi descartado", () => {
    expect(resumirDescartes([])).toBeNull();
  });

  it("agrupa por motivo e pluraliza", () => {
    const texto = resumirDescartes([
      { url: "a", titulo: "A", motivo: "dominio_bloqueado" },
      { url: "b", titulo: "B", motivo: "dominio_bloqueado" },
      { url: "c", titulo: "C", motivo: "orgao_proprio" },
    ]);

    expect(texto).toContain("2 resultados");
    expect(texto).toContain("marketplaces");
    expect(texto).toContain("1 resultado ");
  });
});
