import { describe, it, expect, vi, afterEach } from "vitest";
import { buscarItensContratacoesCompraGov } from "../comprasGovContratacoes";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Item como o `modulo-contratacoes` devolve, com valores de exemplo do spike (ApiPlan.md §4.1c). */
function itemDe(over: Record<string, unknown> = {}) {
  return {
    codItemCatalogo: 331791,
    codigoClasse: 7510,
    descricaoItem: "CAPA ENCADERNAÇÃO, MATERIAL PVC, TIPO A3",
    valorUnitarioEstimado: 1.69,
    valorUnitarioResultado: 1.0,
    quantidadeResultado: 100,
    dataResultado: "2026-02-20",
    temResultado: true,
    dataCancelamentoPncp: null,
    orgaoEntidadeCnpj: "12345678000199",
    orgaoEntidadeRazaoSocial: "Prefeitura Teste",
    nomeFornecedor: "VM COMERCIO DE PAPEL LTDA",
    idContratacaoPNCP: "12345678000199-1-000010/2025",
    ...over,
  };
}

function mockPagina(resultado: unknown[], paginasRestantes = 0) {
  return {
    ok: true,
    json: async () => ({
      resultado,
      totalRegistros: resultado.length,
      totalPaginas: 1,
      paginasRestantes,
    }),
  } as Response;
}

const filtroPadrao = { codItemCatalogo: 331791 };
const periodoPadrao = {
  dataInicial: new Date("2026-01-01T00:00:00Z"),
  dataFinal: new Date("2026-01-31T00:00:00Z"),
};

describe("buscarItensContratacoesCompraGov", () => {
  it("retorna lista vazia quando nenhum filtro (codItemCatalogo/codigoClasse) é informado", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await buscarItensContratacoesCompraGov({}, periodoPadrao);

    expect(resultado).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mapeia um item válido para ItemContratacaoCompraGov", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(mockPagina([itemDe()]));

    const resultado = await buscarItensContratacoesCompraGov(filtroPadrao, periodoPadrao);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      codItemCatalogo: 331791,
      descricaoItem: "CAPA ENCADERNAÇÃO, MATERIAL PVC, TIPO A3",
      valorUnitarioResultado: 1.0,
      quantidadeHomologada: 100,
      orgaoEntidadeCnpj: "12345678000199",
      nomeFornecedorVencedor: "VM COMERCIO DE PAPEL LTDA",
    });
    expect(resultado[0]?.dataResultado.toISOString()).toContain("2026-02-20");
  });

  describe("preço homologado, nunca o estimado (CLAUDE.md §9.61a)", () => {
    it("usa valorUnitarioResultado e ignora valorUnitarioEstimado", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockPagina([itemDe({ valorUnitarioEstimado: 96.37, valorUnitarioResultado: 0.26 })]),
      );

      const resultado = await buscarItensContratacoesCompraGov(filtroPadrao, periodoPadrao);

      expect(resultado[0]?.valorUnitarioResultado).toBe(0.26);
      expect(resultado[0]?.valorUnitarioResultado).not.toBe(96.37);
    });
  });

  describe("descarte de itens sem resultado válido", () => {
    it("descarta item sem temResultado", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(mockPagina([itemDe({ temResultado: false })]));

      const resultado = await buscarItensContratacoesCompraGov(filtroPadrao, periodoPadrao);

      expect(resultado).toEqual([]);
    });

    it("descarta item com temResultado ausente", async () => {
      const item = itemDe();
      delete (item as Record<string, unknown>).temResultado;
      vi.spyOn(global, "fetch").mockResolvedValue(mockPagina([item]));

      const resultado = await buscarItensContratacoesCompraGov(filtroPadrao, periodoPadrao);

      expect(resultado).toEqual([]);
    });

    it("descarta item com dataCancelamentoPncp preenchida", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockPagina([itemDe({ dataCancelamentoPncp: "2026-02-01" })]),
      );

      const resultado = await buscarItensContratacoesCompraGov(filtroPadrao, periodoPadrao);

      expect(resultado).toEqual([]);
    });

    it("descarta item sem valor homologado", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockPagina([itemDe({ valorUnitarioResultado: null })]),
      );

      const resultado = await buscarItensContratacoesCompraGov(filtroPadrao, periodoPadrao);

      expect(resultado).toEqual([]);
    });

    it("descarta item sem idContratacaoPNCP parseável (sem evidência derivável)", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockPagina([itemDe({ idContratacaoPNCP: "formato-inesperado" })]),
      );

      const resultado = await buscarItensContratacoesCompraGov(filtroPadrao, periodoPadrao);

      expect(resultado).toEqual([]);
    });
  });

  describe("exclusão do próprio órgão (CLAUDE.md §9.9)", () => {
    const CNPJ_PROPRIO = "49203409000102";

    it("exclui item cujo orgaoEntidadeCnpj é o CNPJ do próprio órgão (padrão)", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockPagina([itemDe({ orgaoEntidadeCnpj: CNPJ_PROPRIO })]),
      );

      const resultado = await buscarItensContratacoesCompraGov(filtroPadrao, periodoPadrao);

      expect(resultado).toEqual([]);
    });

    it("respeita ORGAO_CNPJ do ambiente", async () => {
      vi.stubEnv("ORGAO_CNPJ", "98765432000188");
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockPagina([itemDe({ orgaoEntidadeCnpj: "98765432000188" })]),
      );

      const resultado = await buscarItensContratacoesCompraGov(filtroPadrao, periodoPadrao);

      expect(resultado).toEqual([]);
    });

    it("mantém itens de outros órgãos", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockPagina([itemDe({ orgaoEntidadeCnpj: "11111111000191" })]),
      );

      const resultado = await buscarItensContratacoesCompraGov(filtroPadrao, periodoPadrao);

      expect(resultado).toHaveLength(1);
    });
  });

  describe("URL de evidência derivada de idContratacaoPNCP", () => {
    it("deriva a URL exata a partir do exemplo real do spike", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockPagina([
          itemDe({
            idContratacaoPNCP: "13672605000170-1-000119/2025",
            orgaoEntidadeCnpj: "13672605000170",
          }),
        ]),
      );

      const resultado = await buscarItensContratacoesCompraGov(filtroPadrao, periodoPadrao);

      expect(resultado[0]?.fonteUrl).toBe("https://pncp.gov.br/app/editais/13672605000170/2025/119");
    });
  });

  describe("paginação pelo envelope (resultado/paginasRestantes)", () => {
    it("segue paginando até paginasRestantes === 0", async () => {
      const urls: string[] = [];
      let chamada = 0;
      vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        urls.push(String(input));
        chamada++;
        if (chamada === 1) {
          return mockPagina([itemDe({ codItemCatalogo: 1 })], 1);
        }
        if (chamada === 2) {
          return mockPagina([itemDe({ codItemCatalogo: 2 })], 0);
        }
        throw new Error("Não deveria pedir uma terceira página");
      });

      const resultado = await buscarItensContratacoesCompraGov(filtroPadrao, periodoPadrao);

      expect(resultado).toHaveLength(2);
      expect(urls.some((u) => u.includes("pagina=1"))).toBe(true);
      expect(urls.some((u) => u.includes("pagina=2"))).toBe(true);
    });

    it("não pede segunda página quando paginasRestantes já é 0", async () => {
      const urls: string[] = [];
      vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        urls.push(String(input));
        return mockPagina([itemDe()], 0);
      });

      await buscarItensContratacoesCompraGov(filtroPadrao, periodoPadrao);

      expect(urls).toHaveLength(1);
    });
  });

  describe("janela máxima de 365 dias", () => {
    it("período de até 365 dias gera uma única janela/chamada", async () => {
      const urls: string[] = [];
      vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        urls.push(String(input));
        return mockPagina([]);
      });

      await buscarItensContratacoesCompraGov(filtroPadrao, {
        dataInicial: new Date("2025-01-01T00:00:00Z"),
        dataFinal: new Date("2025-12-31T00:00:00Z"),
      });

      expect(urls).toHaveLength(1);
    });

    it("período acima de 365 dias é dividido em janelas móveis com datas distintas", async () => {
      const chamadas: { dataInicial: string; dataFinal: string }[] = [];
      vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        const url = new URL(String(input));
        chamadas.push({
          dataInicial: url.searchParams.get("dataInicial")!,
          dataFinal: url.searchParams.get("dataFinal")!,
        });
        return mockPagina([]);
      });

      // 800 dias > 365: precisa de pelo menos 3 janelas.
      await buscarItensContratacoesCompraGov(filtroPadrao, {
        dataInicial: new Date("2024-01-01T00:00:00Z"),
        dataFinal: new Date("2026-03-10T00:00:00Z"),
      });

      expect(chamadas.length).toBeGreaterThanOrEqual(3);

      const janelasDistintas = new Set(chamadas.map((c) => `${c.dataInicial}|${c.dataFinal}`));
      expect(janelasDistintas.size).toBe(chamadas.length);

      for (const c of chamadas) {
        const dias =
          (new Date(c.dataFinal).getTime() - new Date(c.dataInicial).getTime()) /
          (24 * 60 * 60 * 1000);
        expect(dias).toBeLessThanOrEqual(364);
      }
    });

    it("agrega os resultados de todas as janelas do período", async () => {
      let chamada = 0;
      vi.spyOn(global, "fetch").mockImplementation(async () => {
        chamada++;
        return mockPagina([itemDe({ codItemCatalogo: chamada })]);
      });

      const resultado = await buscarItensContratacoesCompraGov(filtroPadrao, {
        dataInicial: new Date("2024-01-01T00:00:00Z"),
        dataFinal: new Date("2026-03-10T00:00:00Z"),
      });

      expect(resultado.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("filtro por codItemCatalogo/codigoClasse", () => {
    it("inclui codItemCatalogo na URL quando informado", async () => {
      const urls: string[] = [];
      vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        urls.push(String(input));
        return mockPagina([]);
      });

      await buscarItensContratacoesCompraGov({ codItemCatalogo: 331791 }, periodoPadrao);

      expect(urls[0]).toContain("codItemCatalogo=331791");
    });

    it("inclui codigoClasse na URL quando informado", async () => {
      const urls: string[] = [];
      vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        urls.push(String(input));
        return mockPagina([]);
      });

      await buscarItensContratacoesCompraGov({ codigoClasse: 7510 }, periodoPadrao);

      expect(urls[0]).toContain("codigoClasse=7510");
    });
  });

  describe("resiliência de rede", () => {
    it("tenta de novo com backoff quando a rede falha e sucede na tentativa seguinte", async () => {
      vi.useFakeTimers();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      let tentativas = 0;
      vi.spyOn(global, "fetch").mockImplementation(async () => {
        tentativas++;
        if (tentativas === 1) throw new Error("read ECONNRESET");
        return mockPagina([itemDe()]);
      });

      const promessa = buscarItensContratacoesCompraGov(filtroPadrao, periodoPadrao);
      await vi.runAllTimersAsync();
      const resultado = await promessa;

      expect(tentativas).toBe(2);
      expect(resultado).toHaveLength(1);
      vi.useRealTimers();
    });

    it("devolve lista vazia quando a API responde erro persistente", async () => {
      vi.useFakeTimers();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 500 } as Response);

      const promessa = buscarItensContratacoesCompraGov(filtroPadrao, periodoPadrao);
      await vi.runAllTimersAsync();
      const resultado = await promessa;

      expect(resultado).toEqual([]);
      vi.useRealTimers();
    });
  });
});
