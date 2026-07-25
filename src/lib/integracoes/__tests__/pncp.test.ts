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

function mockItens(itens: unknown[]) {
  return {
    ok: true,
    json: async () => itens,
  } as Response;
}

describe("buscarContratosPNCP", () => {
  it("busca pelo termo informado e mapeia os itens para CandidatoSimilaridade", async () => {
    const processo = {
      numero_controle_pncp: "123",
      orgao_nome: "Prefeitura Teste",
      orgao_cnpj: "00000000000100",
      ano: "2026",
      numero_sequencial: "1",
    };
    const item = {
      descricao: "Cadeira de escritório",
      valorUnitarioEstimado: 250.5,
      quantidade: 50,
      unidadeMedida: "unidade",
      dataAtualizacao: "2026-01-10T00:00:00Z",
    };

    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/search/")) {
        return mockBusca([processo]);
      }
      if (url.includes("/itens")) {
        return mockItens([item]);
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    const resultado = await buscarContratosPNCP("cadeira de escritório");

    expect(resultado.length).toBeGreaterThan(0);
    expect(resultado[0]).toMatchObject({
      tipoCandidato: "contratacao_publica",
      fonteDescricao: "Cadeira de escritório",
      fonteOrgaoOuId: "Prefeitura Teste",
      valorUnitario: 250.5,
      unidade: "unidade",
      quantidade: 50,
    });
  });

  it("ordena a busca textual por relevância, não por data", async () => {
    const urls: string[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      urls.push(String(input));
      return mockBusca([]);
    });

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
    const processo = {
      numero_controle_pncp: "123",
      orgao_nome: "Prefeitura Teste",
      orgao_cnpj: "00000000000100",
      ano: "2026",
      numero_sequencial: "1",
    };
    let chamadasBusca = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/search/")) {
        chamadasBusca++;
        if (chamadasBusca === 1) throw new Error("read ECONNRESET");
        return mockBusca([processo]);
      }
      if (url.includes("/itens")) return mockItens([]);
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
      return mockItens([]);
    });

    await buscarContratosPNCP("caneta");

    expect(maxEmVoo).toBeLessThanOrEqual(5);
  });

  it("ignora itens sem valor unitário estimado", async () => {
    const processo = {
      numero_controle_pncp: "123",
      orgao_nome: "Prefeitura Teste",
      orgao_cnpj: "00000000000100",
      ano: "2026",
      numero_sequencial: "1",
    };
    const itemSemValor = {
      descricao: "Item sem cotação",
      valorUnitarioEstimado: 0,
      quantidade: 1,
      unidadeMedida: "unidade",
      dataAtualizacao: "2026-01-10T00:00:00Z",
    };

    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/search/")) {
        return mockBusca([processo]);
      }
      if (url.includes("/itens")) {
        return mockItens([itemSemValor]);
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    const resultado = await buscarContratosPNCP("qualquer coisa");
    expect(resultado).toEqual([]);
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

  const itemPadrao = {
    descricao: "Cadeira de escritório",
    valorUnitarioEstimado: 250.5,
    quantidade: 50,
    unidadeMedida: "unidade",
    dataAtualizacao: "2026-01-10T00:00:00Z",
  };

  function mockPncp(processos: unknown[]) {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/search/")) return mockBusca(processos);
      if (url.includes("/itens")) return mockItens([itemPadrao]);
      throw new Error(`URL inesperada: ${url}`);
    });
  }

  it("gera a URL do edital no formato /app/editais/{cnpj}/{ano}/{sequencial}", async () => {
    mockPncp([processoDe("12345678000199")]);

    const resultado = await buscarContratosPNCP("cadeira");

    // Formato exato: o portal PNCP retorna erro para /app/editais/{numero_controle_pncp},
    // e link inválido invalida a evidência para instrução processual.
    expect(resultado[0]?.fonteUrl).toBe("https://pncp.gov.br/app/editais/12345678000199/2026/123");
  });

  it("exclui contratações do próprio órgão dos candidatos de similaridade", async () => {
    mockPncp([processoDe(CNPJ_PROPRIO, "Câmara Municipal de Santos")]);

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado).toEqual([]);
  });

  it("exclui o próprio órgão mesmo quando a API devolve o CNPJ com máscara", async () => {
    mockPncp([processoDe("49.203.409/0001-02", "Câmara Municipal de Santos")]);

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado).toEqual([]);
  });

  it("respeita ORGAO_CNPJ do ambiente, com ou sem máscara", async () => {
    vi.stubEnv("ORGAO_CNPJ", "12.345.678/0001-99");
    mockPncp([processoDe("12345678000199")]);

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado).toEqual([]);
    vi.unstubAllEnvs();
  });

  it("mantém contratações de outros órgãos no resultado", async () => {
    mockPncp([processoDe("12345678000199", "Prefeitura de Outra Cidade")]);

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
    mockPncp([processoDe("12345678000199", "Prefeitura A")]);

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
    mockPncp([processoDe("12345678000199", "Prefeitura A")]);

    const { buscarContratosPNCP: buscar } = await import("../pncp");
    const resultado = await buscar("cadeira");

    // Confirma que o caminho do fallback realmente não foi tomado: o CNPJ do
    // ambiente é o que filtra, e nenhum aviso foi emitido.
    expect(resultado).toEqual([]);
    const avisos = warnSpy.mock.calls.filter((args) => String(args[0]).includes("ORGAO_CNPJ"));
    expect(avisos).toHaveLength(0);
  });

  it("filtra apenas o próprio órgão quando o resultado mistura órgãos", async () => {
    mockPncp([
      processoDe("12345678000199", "Prefeitura A"),
      processoDe(CNPJ_PROPRIO, "Câmara Municipal de Santos"),
      processoDe("98765432000188", "Prefeitura B"),
    ]);

    const resultado = await buscarContratosPNCP("cadeira");

    expect(resultado.map((c) => c.fonteOrgaoOuId)).toEqual(["Prefeitura A", "Prefeitura B"]);
  });
});
