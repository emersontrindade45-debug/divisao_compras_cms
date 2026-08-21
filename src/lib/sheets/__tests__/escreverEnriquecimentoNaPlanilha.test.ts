import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  valuesGetMock: vi.fn(),
  batchUpdateMock: vi.fn(),
  getMock: vi.fn(),
}));

vi.mock("../googleAuth", () => ({
  getSheetsClient: () => ({
    spreadsheets: {
      get: mocks.getMock,
      values: { batchUpdate: mocks.batchUpdateMock, get: mocks.valuesGetMock },
    },
  }),
  // `lerAbaAutenticado` é testado direto (googleAuth.test.ts) — aqui só repassa
  // o resultado de `values.get` no formato string[][], mesma lógica da função real.
  lerAbaAutenticado: async () => {
    const res = await mocks.valuesGetMock();
    const linhas: string[][] = res.data.values ?? [];
    const largura = linhas.reduce((max: number, l: string[]) => Math.max(max, l.length), 0);
    return linhas.map((l) => Array.from({ length: largura }, (_, i) => String(l[i] ?? "")));
  },
}));

import { escreverEnriquecimentoNaPlanilha } from "../escreverEnriquecimentoNaPlanilha";

const CABECALHO = [
  "#",
  "Nome/Razão Social",
  "CPF/CNPJ",
  "Telefone",
  "Telefone 2",
  "E-mail",
  "Contato",
  "Município",
  "UF",
  "Tags",
];

/** Fixtures simples (sem vírgula/aspas dentro de campo) — split direto é suficiente aqui. */
function linhasParaValuesGet(linhasCsv: string[]): string[][] {
  return [CABECALHO, ...linhasCsv.map((l) => l.split(","))];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FORNECEDORES_SHEETS_URL = "https://docs.google.com/spreadsheets/d/abc123/edit";
  mocks.getMock.mockResolvedValue({
    data: { sheets: [{ properties: { title: "Fornecedores", sheetId: 1106271462 } }] },
  });
  mocks.batchUpdateMock.mockResolvedValue({});
});

describe("escreverEnriquecimentoNaPlanilha", () => {
  it("preenche só as colunas vazias (Município/UF/Telefone/E-mail/Tags)", async () => {
    mocks.valuesGetMock.mockResolvedValue({
      data: { values: linhasParaValuesGet(["10,Empresa X,11.222.333/0001-81,,,,,,,"]) },
    });

    const resultado = await escreverEnriquecimentoNaPlanilha([
      {
        origemPlanilhaLinhaId: "10",
        razaoSocial: "Empresa X",
        cidade: "Santos",
        estado: "SP",
        categoria: ["Serviços gerais"],
        email: "contato@empresax.com",
        telefone: "(13) 99999-8888",
      },
    ]);

    expect(resultado).toEqual({
      linhasAtualizadas: 1,
      linhasNaoEncontradas: [],
      camposIgnoradosPorJaPreenchidos: 0,
    });
    expect(mocks.batchUpdateMock).toHaveBeenCalledTimes(1);
    const chamada = mocks.batchUpdateMock.mock.calls[0]![0];
    const ranges = chamada.requestBody.data.map((d: { range: string }) => d.range);
    // Colunas do CABECALHO: #(A),Nome(B),CNPJ(C),Tel(D),Tel2(E),Email(F),Contato(G),Municipio(H),UF(I),Tags(J).
    // Linha de dados é a 2ª linha da planilha (cabeçalho ocupa a 1ª).
    expect(ranges).toEqual(
      expect.arrayContaining([
        "'Fornecedores'!D2",
        "'Fornecedores'!F2",
        "'Fornecedores'!H2",
        "'Fornecedores'!I2",
        "'Fornecedores'!J2",
      ]),
    );
  });

  it("NUNCA sobrescreve célula já preenchida na planilha (Cidade/UF/Telefone/E-mail/Tags)", async () => {
    mocks.valuesGetMock.mockResolvedValue({
      data: {
        values: linhasParaValuesGet([
          "10,Empresa X,11.222.333/0001-81,(13) 3333-4444,,ja@existe.com,,Santos Já Preenchido,SP,Tag Existente",
        ]),
      },
    });

    const resultado = await escreverEnriquecimentoNaPlanilha([
      {
        origemPlanilhaLinhaId: "10",
        razaoSocial: "Empresa X",
        cidade: "Outra Cidade",
        estado: "RJ",
        categoria: ["Categoria Nova"],
        email: "novo@email.com",
        telefone: "(11) 88888-7777",
      },
    ]);

    expect(resultado).toEqual({
      linhasAtualizadas: 0,
      linhasNaoEncontradas: [],
      camposIgnoradosPorJaPreenchidos: 5,
    });
    expect(mocks.batchUpdateMock).not.toHaveBeenCalled();
  });

  it("preenche Telefone só quando AMBAS as colunas de telefone estão vazias", async () => {
    mocks.valuesGetMock.mockResolvedValue({
      data: { values: linhasParaValuesGet(["10,Empresa X,11.222.333/0001-81,,(13) 3333-4444,,,,,"]) },
    });

    const resultado = await escreverEnriquecimentoNaPlanilha([
      {
        origemPlanilhaLinhaId: "10",
        razaoSocial: "Empresa X",
        cidade: "",
        estado: "",
        categoria: [],
        email: "",
        telefone: "(11) 88888-7777",
      },
    ]);

    expect(resultado.camposIgnoradosPorJaPreenchidos).toBe(1);
    expect(mocks.batchUpdateMock).not.toHaveBeenCalled();
  });

  it("razão social é a única exceção: sobrescreve quando diverge (mesma regra do M26)", async () => {
    mocks.valuesGetMock.mockResolvedValue({
      data: { values: linhasParaValuesGet(["10,Nome Antigo Divergente,11.222.333/0001-81,,,,,,,"]) },
    });

    const resultado = await escreverEnriquecimentoNaPlanilha([
      {
        origemPlanilhaLinhaId: "10",
        razaoSocial: "Nome Correto Da Receita",
        cidade: "",
        estado: "",
        categoria: [],
        email: "",
        telefone: null,
      },
    ]);

    expect(resultado.linhasAtualizadas).toBe(1);
    const chamada = mocks.batchUpdateMock.mock.calls[0]![0];
    const ranges = chamada.requestBody.data.map((d: { range: string }) => d.range);
    expect(ranges).toEqual(["'Fornecedores'!B2"]);
    expect(chamada.requestBody.data[0].values).toEqual([["Nome Correto Da Receita"]]);
  });

  it("não escreve nada quando razão social já bate (ignorando acento/caixa)", async () => {
    mocks.valuesGetMock.mockResolvedValue({
      data: { values: linhasParaValuesGet(["10,empresa   x,11.222.333/0001-81,,,,,,,"]) },
    });

    const resultado = await escreverEnriquecimentoNaPlanilha([
      {
        origemPlanilhaLinhaId: "10",
        razaoSocial: "Empresa X",
        cidade: "",
        estado: "",
        categoria: [],
        email: "",
        telefone: null,
      },
    ]);

    expect(resultado.linhasAtualizadas).toBe(0);
    expect(mocks.batchUpdateMock).not.toHaveBeenCalled();
  });

  it("reporta linhaId não encontrado na planilha sem lançar exceção nem afetar as demais", async () => {
    mocks.valuesGetMock.mockResolvedValue({
      data: { values: linhasParaValuesGet(["10,Empresa X,11.222.333/0001-81,,,,,,,"]) },
    });

    const resultado = await escreverEnriquecimentoNaPlanilha([
      {
        origemPlanilhaLinhaId: "999",
        razaoSocial: "Empresa Fantasma",
        cidade: "Santos",
        estado: "SP",
        categoria: [],
        email: "",
        telefone: null,
      },
    ]);

    expect(resultado.linhasNaoEncontradas).toEqual(["999"]);
    expect(resultado.linhasAtualizadas).toBe(0);
    expect(mocks.batchUpdateMock).not.toHaveBeenCalled();
  });

  it("não chama batchUpdate quando não há nada para escrever em nenhuma linha", async () => {
    mocks.valuesGetMock.mockResolvedValue({ data: { values: linhasParaValuesGet([]) } });

    const resultado = await escreverEnriquecimentoNaPlanilha([]);

    expect(resultado).toEqual({
      linhasAtualizadas: 0,
      linhasNaoEncontradas: [],
      camposIgnoradosPorJaPreenchidos: 0,
    });
    expect(mocks.batchUpdateMock).not.toHaveBeenCalled();
  });

  it("modo dry-run calcula o resultado mas não chama batchUpdate", async () => {
    mocks.valuesGetMock.mockResolvedValue({
      data: { values: linhasParaValuesGet(["10,Empresa X,11.222.333/0001-81,,,,,,,"]) },
    });

    const resultado = await escreverEnriquecimentoNaPlanilha(
      [
        {
          origemPlanilhaLinhaId: "10",
          razaoSocial: "Empresa X",
          cidade: "Santos",
          estado: "SP",
          categoria: [],
          email: "",
          telefone: null,
        },
      ],
      { dryRun: true },
    );

    expect(resultado.linhasAtualizadas).toBe(1);
    expect(mocks.batchUpdateMock).not.toHaveBeenCalled();
  });

  it("lança erro amigável quando FORNECEDORES_SHEETS_URL não está configurada", async () => {
    delete process.env.FORNECEDORES_SHEETS_URL;

    await expect(escreverEnriquecimentoNaPlanilha([])).rejects.toThrow(/FORNECEDORES_SHEETS_URL/);
    expect(mocks.batchUpdateMock).not.toHaveBeenCalled();
  });
});
