import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrecoMaterialPainel } from "@/lib/integracoes/comprasGovMateriais";

const mocks = vi.hoisted(() => ({
  encontrarCodigos: vi.fn(),
  consultarPdm: vi.fn(),
  buscarPrecos: vi.fn(),
  resolverUrl: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("../matchingCatalogoLocal", () => ({
  encontrarCodigosCatalogoLocal: mocks.encontrarCodigos,
}));
vi.mock("@/lib/integracoes/comprasGovMateriais", () => ({
  consultarPdmDoItemCatmat: mocks.consultarPdm,
  buscarPrecosMaterialPorPdm: mocks.buscarPrecos,
  urlEditalHomologadoPncp: mocks.resolverUrl,
}));

import {
  buscarCandidatosPainelMateriais,
  escolherFamilias,
  selecionarParaValidacao,
  TEMPO_MAX_PAINEL_MATERIAIS_MS,
} from "../provedorPainelMateriais";

const AGORA = new Date("2026-11-09T12:00:00Z");
const CNPJ_PROPRIO = "49203409000102";

function preco(over: Partial<PrecoMaterialPainel> = {}): PrecoMaterialPainel {
  return {
    idCompra: "46272305900232025",
    numeroItemCompra: 1,
    codigoPdm: 226,
    descricaoItem: "IMPRESSORA MULTIFUNCIONAL, TIPO IMPRESSÃO: LASER, COLORIDA",
    unidade: "UN",
    quantidade: 2,
    precoUnitario: 3150,
    marca: "Brother",
    nomeFornecedor: "FORNECEDOR X",
    nomeOrgao: "PREFEITURA MUNICIPAL DE CUBATÃO",
    estado: "SP",
    municipio: "CUBATÃO",
    modalidade: 6,
    dataResultado: new Date("2026-10-20T00:00:00Z"),
    ...over,
  };
}

const urlDe = (id: string, cnpj = "46377800000127") =>
  `https://pncp.gov.br/app/editais/${cnpj}/2026/${id.slice(-4)}`;

describe("buscarCandidatosPainelMateriais", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ORGAO_CNPJ = CNPJ_PROPRIO;
    mocks.encontrarCodigos.mockResolvedValue([292079]);
    mocks.consultarPdm.mockResolvedValue({ codigo: 226, nome: "IMPRESSORA MULTIFUNCIONAL" });
    mocks.buscarPrecos.mockResolvedValue([preco()]);
    mocks.resolverUrl.mockImplementation(async (id: string) => urlDe(id));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("devolve [] sem consultar preço quando o termo não casa com nenhum código CATMAT", async () => {
    mocks.encontrarCodigos.mockResolvedValue([]);

    expect(await buscarCandidatosPainelMateriais("xyz", undefined, AGORA)).toEqual([]);
    expect(mocks.buscarPrecos).not.toHaveBeenCalled();
  });

  it("consulta as famílias de nome compatível com o termo, a mais aderente primeiro", async () => {
    mocks.encontrarCodigos.mockResolvedValue([1, 2, 3, 4]);
    const familias: Record<number, { codigo: number; nome: string }> = {
      1: { codigo: 99, nome: "IMPRESSORA TÉRMICA" },
      2: { codigo: 226, nome: "IMPRESSORA MULTIFUNCIONAL" },
      3: { codigo: 226, nome: "IMPRESSORA MULTIFUNCIONAL" },
      4: { codigo: 7, nome: "FOGÃO INDUSTRIAL" },
    };
    mocks.consultarPdm.mockImplementation(async (c: number) => familias[c]);

    await buscarCandidatosPainelMateriais("impressora multifuncional", undefined, AGORA);

    const consultadas = mocks.buscarPrecos.mock.calls.map((c) => c[0].codigoPdm);
    expect(consultadas).toEqual([226, 99]);
  });

  it("não consulta preço quando nenhuma família tem nome compatível (scanner → cozinha)", async () => {
    // Caso medido na API real: "scanner alta produção" ancorava em "produção".
    mocks.consultarPdm.mockResolvedValue({ codigo: 5, nome: "EQUIPAMENTOS PARA COZINHAR" });

    const candidatos = await buscarCandidatosPainelMateriais(
      "scanner alta produção",
      undefined,
      AGORA,
    );

    expect(candidatos).toEqual([]);
    expect(mocks.buscarPrecos).not.toHaveBeenCalled();
  });

  it("também ancora o matching na primeira palavra do termo (o núcleo do objeto)", async () => {
    await buscarCandidatosPainelMateriais("scanner alta produção", undefined, AGORA);

    const termosConsultados = mocks.encontrarCodigos.mock.calls.map((c) => c[0]);
    expect(termosConsultados).toEqual(["scanner alta produção", "scanner"]);
  });

  it("LANÇA quando nenhuma família pôde ser consultada por falha da fonte (ex.: 429)", async () => {
    mocks.consultarPdm.mockRejectedValue(new Error("HTTP 429"));

    await expect(buscarCandidatosPainelMateriais("impressora", undefined, AGORA)).rejects.toThrow(
      /não respondeu/,
    );
    expect(mocks.buscarPrecos).not.toHaveBeenCalled();
  });

  it("repassa UF e esfera do analista como estado/esfera, com janela de 730 dias", async () => {
    await buscarCandidatosPainelMateriais(
      "impressora",
      { uf: "SP", esfera: "M", status: "encerradas" },
      AGORA,
    );

    const consulta = mocks.buscarPrecos.mock.calls[0]![0];
    expect(consulta).toMatchObject({ codigoPdm: 226, estado: "SP", esfera: "M" });
    expect(consulta.dataFim).toEqual(AGORA);
    expect((AGORA.getTime() - consulta.dataInicio.getTime()) / 86_400_000).toBe(730);
  });

  it("mapeia o candidato com o link verificado como evidência", async () => {
    const [candidato] = await buscarCandidatosPainelMateriais("impressora", undefined, AGORA);

    expect(candidato).toEqual({
      tipoCandidato: "painel_precos",
      fonteDescricao: "IMPRESSORA MULTIFUNCIONAL, TIPO IMPRESSÃO: LASER, COLORIDA",
      fonteOrgaoOuId: "PREFEITURA MUNICIPAL DE CUBATÃO",
      fonteUrl: urlDe("46272305900232025"),
      valorUnitario: 3150,
      dataReferencia: new Date("2026-10-20T00:00:00Z"),
      unidade: "UN",
      quantidade: 2,
    });
    expect(mocks.resolverUrl).toHaveBeenCalledWith("46272305900232025");
  });

  it("descarta candidato sem link verificado (não homologado no PNCP ou página inexistente)", async () => {
    mocks.buscarPrecos.mockResolvedValue([
      preco({ idCompra: "1000000000000001" }),
      preco({ idCompra: "2000000000000002", descricaoItem: "IMPRESSORA MULTIFUNCIONAL JATO" }),
    ]);
    mocks.resolverUrl.mockImplementation(async (id: string) =>
      id === "1000000000000001" ? null : urlDe(id),
    );

    const candidatos = await buscarCandidatosPainelMateriais("impressora", undefined, AGORA);

    expect(candidatos.map((c) => c.fonteUrl)).toEqual([urlDe("2000000000000002")]);
  });

  it("descarta o candidato quando a prova de homologação falha (ex.: 429) — falha não aprova", async () => {
    mocks.buscarPrecos.mockResolvedValue([
      preco({ idCompra: "1000000000000001" }),
      preco({ idCompra: "2000000000000002", descricaoItem: "IMPRESSORA MULTIFUNCIONAL JATO" }),
    ]);
    mocks.resolverUrl.mockImplementation(async (id: string) => {
      if (id === "1000000000000001") throw new Error("HTTP 429");
      return urlDe(id);
    });

    const candidatos = await buscarCandidatosPainelMateriais("impressora", undefined, AGORA);

    expect(candidatos.map((c) => c.fonteUrl)).toEqual([urlDe("2000000000000002")]);
  });

  it("exclui compra do próprio órgão pelo CNPJ da URL (§9.9)", async () => {
    mocks.buscarPrecos.mockResolvedValue([
      preco({ idCompra: "1000000000000001" }),
      preco({ idCompra: "2000000000000002", descricaoItem: "IMPRESSORA MULTIFUNCIONAL JATO" }),
    ]);
    mocks.resolverUrl.mockImplementation(async (id: string) =>
      id === "1000000000000001" ? urlDe(id, CNPJ_PROPRIO) : urlDe(id),
    );

    const candidatos = await buscarCandidatosPainelMateriais("impressora", undefined, AGORA);

    expect(candidatos).toHaveLength(1);
    expect(candidatos[0]!.fonteUrl).not.toContain(CNPJ_PROPRIO);
  });

  it("LANÇA quando todas as famílias falham — vira provedor com falha, não 'sem preço'", async () => {
    mocks.buscarPrecos.mockRejectedValue(new Error("ECONNRESET"));

    await expect(buscarCandidatosPainelMateriais("impressora", undefined, AGORA)).rejects.toThrow(
      /não respondeu/,
    );
  });

  it("entrega o que a família que respondeu trouxe quando a outra falha", async () => {
    mocks.encontrarCodigos.mockResolvedValue([1, 2]);
    mocks.consultarPdm.mockImplementation(async (c: number) =>
      c === 1
        ? { codigo: 226, nome: "IMPRESSORA MULTIFUNCIONAL" }
        : { codigo: 99, nome: "IMPRESSORA TÉRMICA" },
    );
    mocks.buscarPrecos.mockImplementation(async ({ codigoPdm }: { codigoPdm: number }) => {
      if (codigoPdm === 99) throw new Error("timeout");
      return [preco()];
    });

    const candidatos = await buscarCandidatosPainelMateriais("impressora", undefined, AGORA);

    expect(candidatos).toHaveLength(1);
  });

  it("validação que não termina até o prazo fica de fora, sem segurar a entrega", async () => {
    vi.useFakeTimers();
    mocks.buscarPrecos.mockResolvedValue([
      preco({ idCompra: "1000000000000001" }),
      preco({ idCompra: "2000000000000002", descricaoItem: "IMPRESSORA MULTIFUNCIONAL JATO" }),
    ]);
    mocks.resolverUrl.mockImplementation((id: string) =>
      id === "1000000000000001" ? new Promise(() => {}) : Promise.resolve(urlDe(id)),
    );

    const promessa = buscarCandidatosPainelMateriais("impressora", undefined, AGORA);
    await vi.advanceTimersByTimeAsync(TEMPO_MAX_PAINEL_MATERIAIS_MS);
    const candidatos = await promessa;

    expect(candidatos.map((c) => c.fonteUrl)).toEqual([urlDe("2000000000000002")]);
  });

  it("o prazo é absoluto: a fila inteira de validação não passa do teto do provedor", async () => {
    vi.useFakeTimers();
    // 20 linhas distintas, cada validação leva 3s; com concorrência 5 seriam
    // 4 ondas = 12s se cada linha ganhasse um prazo próprio.
    mocks.buscarPrecos.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) =>
        preco({ idCompra: String(3000000000000000 + i), descricaoItem: `IMPRESSORA MODELO ${i}` }),
      ),
    );
    mocks.resolverUrl.mockImplementation(
      (id: string) => new Promise((r) => setTimeout(() => r(urlDe(id)), 3_000)),
    );

    let terminou = false;
    const promessa = buscarCandidatosPainelMateriais("impressora", undefined, AGORA).then((c) => {
      terminou = true;
      return c;
    });
    await vi.advanceTimersByTimeAsync(TEMPO_MAX_PAINEL_MATERIAIS_MS + 1);

    expect(terminou).toBe(true);
    const candidatos = await promessa;
    // Ondas de 3s cabem 3 vezes em 9s: 15 validadas, 5 cortadas pelo prazo.
    expect(candidatos).toHaveLength(15);
  });
});

describe("escolherFamilias", () => {
  it("sigla de 2 letras decide a família — HP vence XEROX mesmo com menos votos (medido)", () => {
    const escolhidas = escolherFamilias("cartucho toner HP", [
      { codigo: 13826, nome: "CARTUCHO TONER IMPRESSORA / COPIADORA XEROX" },
      { codigo: 13826, nome: "CARTUCHO TONER IMPRESSORA / COPIADORA XEROX" },
      { codigo: 13826, nome: "CARTUCHO TONER IMPRESSORA / COPIADORA XEROX" },
      { codigo: 13853, nome: "CARTUCHO TONER IMPRESSORA HP" },
    ]);
    expect(escolhidas[0]).toBe(13853);
  });

  it("preposição sozinha não torna família compatível", () => {
    expect(
      escolherFamilias("impressora de cartão", [{ codigo: 5, nome: "EQUIPAMENTO DE COZINHA" }]),
    ).toEqual([]);
  });

  it("descarta família sem nome e respeita o limite", () => {
    const escolhidas = escolherFamilias(
      "impressora laser",
      [
        { codigo: 1, nome: null },
        { codigo: 2, nome: "IMPRESSORA LASER" },
        { codigo: 3, nome: "IMPRESSORA JATO" },
        { codigo: 4, nome: "IMPRESSORA TÉRMICA" },
        null,
      ],
      2,
    );
    expect(escolhidas).toEqual([2, 3]);
  });

  it("no empate de nome, vence a família mais citada pelos códigos casados", () => {
    const escolhidas = escolherFamilias("tablet", [
      { codigo: 10, nome: "TABLET" },
      { codigo: 20, nome: "TABLET" },
      { codigo: 20, nome: "TABLET" },
    ]);
    expect(escolhidas).toEqual([20, 10]);
  });
});

describe("selecionarParaValidacao", () => {
  it("ordena pela aderência ao termo e, no empate, pelo resultado mais recente", () => {
    const selecionados = selecionarParaValidacao("impressora multifuncional colorida", [
      preco({ idCompra: "1", descricaoItem: "IMPRESSORA MULTIFUNCIONAL JATO" }),
      preco({ idCompra: "2", descricaoItem: "IMPRESSORA MULTIFUNCIONAL COLORIDA LASER" }),
      preco({
        idCompra: "3",
        descricaoItem: "IMPRESSORA MULTIFUNCIONAL MONOCROMÁTICA",
        dataResultado: new Date("2026-11-01T00:00:00Z"),
      }),
    ]);

    expect(selecionados.map((p) => p.idCompra)).toEqual(["2", "3", "1"]);
  });

  it("limita a mesma descrição de catálogo a 3 e remove a mesma linha repetida", () => {
    const iguais = Array.from({ length: 5 }, (_, i) =>
      preco({ idCompra: String(i), descricaoItem: "IMPRESSORA MULTIFUNCIONAL LASER." }),
    );
    const repetida = preco({ idCompra: "9", descricaoItem: "IMPRESSORA JATO" });

    const selecionados = selecionarParaValidacao("impressora", [...iguais, repetida, repetida]);

    expect(selecionados.map((p) => p.idCompra)).toEqual(["0", "1", "2", "9"]);
  });

  it("respeita o limite de candidatos a validar", () => {
    const muitos = Array.from({ length: 30 }, (_, i) =>
      preco({ idCompra: String(i), descricaoItem: `IMPRESSORA ${i}` }),
    );
    expect(selecionarParaValidacao("impressora", muitos)).toHaveLength(20);
  });
});
