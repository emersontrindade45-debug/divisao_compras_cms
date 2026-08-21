import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks hoisted para poderem ser referenciados dentro das factories de vi.mock
// (que são içadas para o topo do arquivo, antes de qualquer `const` comum —
// mesmo padrão de src/lib/actions/__tests__/promoverFonte.test.ts).
const mocks = vi.hoisted(() => ({
  valuesGetMock: vi.fn(),
  appendMock: vi.fn(),
  getMock: vi.fn(),
}));

vi.mock("../googleAuth", () => ({
  getSheetsClient: () => ({
    spreadsheets: {
      get: mocks.getMock,
      values: { append: mocks.appendMock, get: mocks.valuesGetMock },
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

import {
  montarLinhaPlanilha,
  proximoLinhaId,
  adicionarCandidatoNaPlanilha,
} from "../escreverCandidatoNaPlanilha";

describe("montarLinhaPlanilha", () => {
  it("posiciona cada campo no índice real do cabeçalho, em qualquer ordem", () => {
    // Ordem arbitrária, bem diferente da planilha real de fornecedores.
    const colunas = { fonte: 0, cnpj: 1, razaoSocial: 3, linhaId: 5 };
    const linha = montarLinhaPlanilha(colunas, 6, {
      linhaId: "42",
      razaoSocial: "Empresa Teste LTDA",
      cnpj: "11.222.333/0001-81",
      cidade: "Santos",
      estado: "SP",
      email: "contato@teste.com",
      telefone: "13999999999",
      fonte: "M27 — Receita Federal",
      categoria: [],
    });

    expect(linha).toEqual([
      "M27 — Receita Federal",
      "11.222.333/0001-81",
      "",
      "Empresa Teste LTDA",
      "",
      "42",
    ]);
  });

  it("deixa em branco campo sem correspondência no cabeçalho (ex.: sem coluna de cidade/estado)", () => {
    const colunas = { razaoSocial: 0, cnpj: 1 };
    const linha = montarLinhaPlanilha(colunas, 2, {
      linhaId: "1",
      razaoSocial: "Empresa X",
      cnpj: "11.222.333/0001-81",
      cidade: "Santos",
      estado: "SP",
      email: "",
      telefone: "",
      fonte: "M27 — Receita Federal",
      categoria: [],
    });

    expect(linha).toEqual(["Empresa X", "11.222.333/0001-81"]);
  });

  it("preenche a coluna de categoria (Tags) juntando o array com vírgula", () => {
    const colunas = { razaoSocial: 0, categoria: 1 };
    const linha = montarLinhaPlanilha(colunas, 2, {
      linhaId: "1",
      razaoSocial: "Empresa X",
      cnpj: "11.222.333/0001-81",
      cidade: "Santos",
      estado: "SP",
      email: "",
      telefone: "",
      fonte: "M27 — Receita Federal",
      categoria: ["Móveis", "Papelaria"],
    });

    expect(linha).toEqual(["Empresa X", "Móveis, Papelaria"]);
  });
});

describe("proximoLinhaId", () => {
  it("devolve '1' para planilha vazia", () => {
    expect(proximoLinhaId([])).toBe("1");
  });

  it("devolve maior valor + 1, mesmo com lacunas na sequência", () => {
    expect(proximoLinhaId([{ linhaId: "1" }, { linhaId: "2" }, { linhaId: "5" }])).toBe("6");
  });

  it("ignora linhaId não numérico ao calcular o máximo", () => {
    expect(proximoLinhaId([{ linhaId: "3" }, { linhaId: "abc" }, { linhaId: "" }])).toBe("4");
  });
});

const CANDIDATO = {
  cnpj: "11.222.333/0001-81",
  razaoSocial: "Empresa Nova LTDA",
  cidade: "Santos",
  estado: "SP",
  email: "contato@empresanova.com",
  telefone: "13988887777",
  fonte: "M27 — Receita Federal",
  categoria: ["Móveis"],
};

const CABECALHO = ["#", "Nome/Razão Social", "CPF/CNPJ", "Município", "UF", "E-mail", "Telefone", "Fonte"];

function linhasParaValuesGet(linhasExtra: string[][]): string[][] {
  return [CABECALHO, ...linhasExtra];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FORNECEDORES_SHEETS_URL = "https://docs.google.com/spreadsheets/d/abc123/edit#gid=0";
  mocks.getMock.mockResolvedValue({
    data: { sheets: [{ properties: { title: "Fornecedores", sheetId: 0 } }] },
  });
  mocks.appendMock.mockResolvedValue({});
});

describe("adicionarCandidatoNaPlanilha", () => {
  it("adiciona o candidato como linha nova quando o CNPJ ainda não está na planilha", async () => {
    mocks.valuesGetMock.mockResolvedValue({
      data: {
        values: linhasParaValuesGet([
          ["1", "Empresa Existente", "11.111.111/0001-11", "Santos", "SP", "", "", ""],
        ]),
      },
    });

    const resultado = await adicionarCandidatoNaPlanilha(CANDIDATO);

    expect(resultado).toEqual({ linhaId: "2", jaExistente: false });
    expect(mocks.appendMock).toHaveBeenCalledTimes(1);
    const chamada = mocks.appendMock.mock.calls[0]![0];
    expect(chamada.spreadsheetId).toBe("abc123");
    expect(chamada.requestBody.values[0]).toEqual([
      "2",
      "Empresa Nova LTDA",
      "11.222.333/0001-81",
      "Santos",
      "SP",
      "contato@empresanova.com",
      "13988887777",
      "M27 — Receita Federal",
    ]);
  });

  it("não escreve de novo quando o CNPJ já está na planilha (dedupe)", async () => {
    mocks.valuesGetMock.mockResolvedValue({
      data: {
        values: linhasParaValuesGet([
          ["1", "Empresa Existente", "11.111.111/0001-11", "Santos", "SP", "", "", ""],
          ["2", "Empresa Nova LTDA", "11.222.333/0001-81", "Santos", "SP", "", "", ""],
        ]),
      },
    });

    const resultado = await adicionarCandidatoNaPlanilha(CANDIDATO);

    expect(resultado).toEqual({ linhaId: "2", jaExistente: true });
    expect(mocks.appendMock).not.toHaveBeenCalled();
  });

  // Regressão: a planilha REAL de fornecedores ("01. FORNECEDORES_OFICIAL") não tem
  // nenhuma aba com sheetId=0 — as abas são Fornecedores (gid=1106271462), Cotações
  // Ativas, Legenda de Tags, Histórico e Ranking. O fixture antigo usava `sheetId: 0`
  // e por isso passava sem testar a premissa (CLAUDE.md §9.63). A aba de dados é a
  // PRIMEIRA da lista, não a de id 0.
  it("escreve na primeira aba quando a planilha não tem nenhuma aba com sheetId=0", async () => {
    mocks.getMock.mockResolvedValue({
      data: {
        sheets: [
          { properties: { title: "Fornecedores", sheetId: 1106271462 } },
          { properties: { title: "Cotações Ativas", sheetId: 1709422097 } },
          { properties: { title: "Histórico", sheetId: 1507387464 } },
        ],
      },
    });
    mocks.valuesGetMock.mockResolvedValue({
      data: {
        values: linhasParaValuesGet([
          ["1", "Empresa Existente", "11.111.111/0001-11", "Santos", "SP", "", "", ""],
        ]),
      },
    });

    const resultado = await adicionarCandidatoNaPlanilha(CANDIDATO);

    expect(resultado).toEqual({ linhaId: "2", jaExistente: false });
    expect(mocks.appendMock).toHaveBeenCalledTimes(1);
    expect(mocks.appendMock.mock.calls[0]![0].range).toBe("'Fornecedores'!A1");
  });

  it("lança erro quando a planilha não tem aba nenhuma", async () => {
    mocks.getMock.mockResolvedValue({ data: { sheets: [] } });

    await expect(adicionarCandidatoNaPlanilha(CANDIDATO)).rejects.toThrow(/aba de dados/);
    expect(mocks.appendMock).not.toHaveBeenCalled();
  });

  it("lança erro amigável quando FORNECEDORES_SHEETS_URL não está configurada", async () => {
    delete process.env.FORNECEDORES_SHEETS_URL;

    await expect(adicionarCandidatoNaPlanilha(CANDIDATO)).rejects.toThrow(
      /FORNECEDORES_SHEETS_URL/,
    );
    expect(mocks.appendMock).not.toHaveBeenCalled();
  });

  it("lança erro quando o cabeçalho não tem coluna de CNPJ", async () => {
    mocks.valuesGetMock.mockResolvedValue({
      data: { values: [["Nome", "Cidade"], ["Empresa X", "Santos"]] },
    });

    await expect(adicionarCandidatoNaPlanilha(CANDIDATO)).rejects.toThrow(/cabeçalho/);
    expect(mocks.appendMock).not.toHaveBeenCalled();
  });
});
