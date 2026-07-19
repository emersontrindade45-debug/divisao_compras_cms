import { describe, it, expect, vi, afterEach } from "vitest";
import { buscarContratosPNCP } from "../pncp";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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
