import { describe, it, expect, vi, beforeEach } from "vitest";

const getMock = vi.fn();
const valuesGetMock = vi.fn();
const valuesBatchUpdateMock = vi.fn();
const structuralBatchUpdateMock = vi.fn();

vi.mock("../googleAuth", () => ({
  getSheetsClient: () => ({
    spreadsheets: {
      get: getMock,
      batchUpdate: structuralBatchUpdateMock,
      values: { get: valuesGetMock, batchUpdate: valuesBatchUpdateMock },
    },
  }),
}));

import { preencherPrecosPublicos } from "../preencherPrecosPublicos";
import { MAX_PRECOS_POR_ITEM } from "../limitesPrecosPublicos";

// MATERIAL na coluna H (índice 7), como nas planilhas reais. Colunas de
// preço público detectadas pelo PRÓPRIO RÓTULO no cabeçalho — não por
// posição fixa — porque cada planilha tem um número diferente de colunas
// de fornecedor direto antes delas (ver comentário do módulo).
const COL_MATERIAL = 7;

function linha(material: string, precoPublico: string[] = []) {
  const row = Array.from({ length: 10 }, () => "");
  row[COL_MATERIAL] = material;
  precoPublico.forEach((v, i) => (row[8 + i] = v));
  return row;
}

function mockGet(headerCabecalho: string[]) {
  getMock.mockImplementation((params: { fields?: string }) => {
    if (params.fields?.includes("properties")) {
      return Promise.resolve({
        data: { sheets: [{ properties: { title: "Modelo", sheetId: 42 } }] },
      });
    }
    if (params.fields?.includes("rowData")) {
      return Promise.resolve({
        data: {
          sheets: [
            { data: [{ rowData: [{ values: [{ userEnteredFormat: { textFormat: { fontSize: 12 } } } ] }] }] },
          ],
        },
      });
    }
    throw new Error(`get() inesperado: ${JSON.stringify(params)}`);
  });
  return headerCabecalho;
}

beforeEach(() => {
  getMock.mockReset();
  valuesGetMock.mockReset();
  valuesBatchUpdateMock.mockReset();
  structuralBatchUpdateMock.mockReset();
  valuesBatchUpdateMock.mockResolvedValue({});
  structuralBatchUpdateMock.mockResolvedValue({});
});

const CABECALHO_COM_COLUNAS = (() => {
  const row = linha("MATERIAL"); // placeholder, sobrescrito abaixo
  row[COL_MATERIAL] = "MATERIAL";
  row[8] = "Preço Público I";
  row[9] = "Preço Público II - Old Org";
  return row;
})();

describe("preencherPrecosPublicos", () => {
  it("escreve o valor na primeira coluna 'Preço Público' vazia e rotula o cabeçalho com numeral e órgão em fonte menor", async () => {
    mockGet([]);
    valuesGetMock.mockResolvedValue({
      data: { values: [CABECALHO_COM_COLUNAS, linha("Cadeira giratória")] },
    });

    const resultado = await preencherPrecosPublicos("sheet-id", [
      {
        descricao: "Cadeira giratória",
        precos: [{ valor: 100, orgao: "CAMARA MUNICIPAL DE AMERICO BRASILIENSE" }],
      },
    ]);

    expect(resultado.linhasPreenchidas).toBe(1);
    expect(resultado.itensSemColunaDisponivel).toEqual([]);

    // Valor vai para a coluna I (primeira "Preço Público" vazia na linha).
    expect(valuesBatchUpdateMock).toHaveBeenCalledTimes(1);
    const { data } = valuesBatchUpdateMock.mock.calls[0]![0].requestBody;
    expect(data).toEqual([{ range: "'Modelo'!I2", values: [[100]] }]);

    // Cabeçalho ganha numeral I (novo, pois a coluna ainda não tinha) e o
    // nome do órgão titulizado, com dois "runs" de fonte diferentes.
    expect(structuralBatchUpdateMock).toHaveBeenCalledTimes(1);
    const { requests } = structuralBatchUpdateMock.mock.calls[0]![0].requestBody;
    expect(requests).toHaveLength(1);
    const cellData = requests[0].updateCells.rows[0].values[0];
    expect(cellData.userEnteredValue.stringValue).toBe(
      "Preço Público I - Camara Municipal De Americo Brasiliense",
    );
    expect(cellData.textFormatRuns).toEqual([
      { startIndex: 0, format: { fontSize: 12 } },
      { startIndex: "Preço Público I - ".length, format: { fontSize: 8 } },
    ]);
    expect(requests[0].updateCells.range).toEqual({
      sheetId: 42,
      startRowIndex: 0,
      endRowIndex: 1,
      startColumnIndex: 8,
      endColumnIndex: 9,
    });
  });

  it("pula coluna 'Preço Público' já ocupada e reaproveita o numeral já escrito na próxima vazia", async () => {
    mockGet([]);
    valuesGetMock.mockResolvedValue({
      data: {
        values: [CABECALHO_COM_COLUNAS, linha("Mesa redonda", ["R$ 50,00"])],
      },
    });

    await preencherPrecosPublicos("sheet-id", [
      { descricao: "Mesa redonda", precos: [{ valor: 200, orgao: "MUNICIPIO DE CURITIBA" }] },
    ]);

    const { data } = valuesBatchUpdateMock.mock.calls[0]![0].requestBody;
    expect(data).toEqual([{ range: "'Modelo'!J2", values: [[200]] }]);

    const { requests } = structuralBatchUpdateMock.mock.calls[0]![0].requestBody;
    expect(requests[0].updateCells.rows[0].values[0].userEnteredValue.stringValue).toBe(
      "Preço Público II - Municipio De Curitiba",
    );
  });

  it("não escreve nada quando todas as colunas 'Preço Público' da linha já estão ocupadas", async () => {
    mockGet([]);
    valuesGetMock.mockResolvedValue({
      data: {
        values: [CABECALHO_COM_COLUNAS, linha("Armário", ["R$ 10,00", "R$ 20,00"])],
      },
    });

    const resultado = await preencherPrecosPublicos("sheet-id", [
      { descricao: "Armário", precos: [{ valor: 300, orgao: "X" }] },
    ]);

    expect(resultado.linhasPreenchidas).toBe(0);
    expect(resultado.itensSemColunaDisponivel).toEqual([{ descricao: "Armário" }]);
    expect(valuesBatchUpdateMock).not.toHaveBeenCalled();
    expect(structuralBatchUpdateMock).not.toHaveBeenCalled();
  });

  it("linhas diferentes com órgãos diferentes vão para colunas diferentes, sem o cabeçalho mentir sobre o valor de nenhuma delas", async () => {
    // Regressão: cada linha, isoladamente, tinha as duas colunas "Preço
    // Público" vazias, então o código antigo mandava as duas para a coluna I
    // (primeira vazia DA LINHA) — o cabeçalho de I acabava rotulado com o
    // órgão da última linha processada, mentindo sobre o valor da primeira.
    mockGet([]);
    valuesGetMock.mockResolvedValue({
      data: {
        values: [
          CABECALHO_COM_COLUNAS,
          linha("Cadeira giratória"),
          linha("Mesa redonda"),
        ],
      },
    });

    await preencherPrecosPublicos("sheet-id", [
      { descricao: "Cadeira giratória", precos: [{ valor: 100, orgao: "ORGAO A" }] },
      { descricao: "Mesa redonda", precos: [{ valor: 200, orgao: "ORGAO B" }] },
    ]);

    const { data } = valuesBatchUpdateMock.mock.calls[0]![0].requestBody;
    // Órgão A fica em I (única linha que usa I), Órgão B vai para J — nunca
    // as duas dividindo a mesma coluna com órgãos diferentes.
    expect(data).toEqual([
      { range: "'Modelo'!I2", values: [[100]] },
      { range: "'Modelo'!J3", values: [[200]] },
    ]);

    const { requests } = structuralBatchUpdateMock.mock.calls[0]![0].requestBody;
    const textoDaColuna = (colIdx: number) =>
      requests.find((r: { updateCells: { range: { startColumnIndex: number } } }) =>
        r.updateCells.range.startColumnIndex === colIdx,
      )?.updateCells.rows[0].values[0].userEnteredValue.stringValue;
    expect(textoDaColuna(8)).toBe("Preço Público I - Orgao A");
    expect(textoDaColuna(9)).toBe("Preço Público II - Orgao B");
  });

  // Regressão medida em produção (processo 1829/2024, 2026-08-31): o item 2
  // tinha 6 candidatos ativos e a planilha, 14 colunas "Preço Público" livres —
  // mesmo assim só 5 preços chegavam à linha, porque o corte era 5 nos dois
  // lados (aqui e no `take` do Prisma) e nada na tela indicava o descarte.
  // O número está escrito à mão de propósito: se a asserção usasse
  // MAX_PRECOS_POR_ITEM ela acompanharia a constante e uma volta a 5 passaria
  // (CLAUDE.md §9.105).
  it("escreve até 10 preços num item quando há colunas 'Preço Público' de sobra", async () => {
    const COLUNAS = 12;
    const largura = 8 + COLUNAS;
    const cabecalho = Array.from({ length: largura }, () => "");
    cabecalho[COL_MATERIAL] = "MATERIAL";
    for (let i = 0; i < COLUNAS; i += 1) cabecalho[8 + i] = "Preço Público";
    const linhaVazia = Array.from({ length: largura }, () => "");
    linhaVazia[COL_MATERIAL] = "Link de internet";

    mockGet([]);
    valuesGetMock.mockResolvedValue({ data: { values: [cabecalho, linhaVazia] } });

    const precos = Array.from({ length: COLUNAS }, (_, i) => ({
      valor: 100 + i,
      orgao: `ORGAO ${i}`,
    }));
    const resultado = await preencherPrecosPublicos("sheet-id", [
      { descricao: "Link de internet", precos },
    ]);

    const { data } = valuesBatchUpdateMock.mock.calls[0]![0].requestBody;
    expect(data).toHaveLength(10);
    expect(MAX_PRECOS_POR_ITEM).toBe(10);
    // Os 10 primeiros da lista (que chega ordenada por score), cada um na sua
    // coluna — nunca dois preços na mesma célula.
    expect(data.map((d: { values: number[][] }) => d.values[0]![0])).toEqual([
      100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
    ]);
    expect(new Set(data.map((d: { range: string }) => d.range)).size).toBe(10);
    expect(resultado.linhasPreenchidas).toBe(1);
  });

  // Planilha real do processo 1829/2024: entre "Preço Público V" e
  // "Preço Público VI - Fundacao…" existe uma coluna só com "Preço Público",
  // sem numeral. Ela é a 6ª da faixa, então numerar pela posição escreveria um
  // segundo "VI" e a memória de cálculo passaria a citar duas colunas com o
  // mesmo nome.
  it("não repete numeral já usado por outra coluna ao rotular uma coluna sem numeral", async () => {
    const largura = 8 + 3;
    const cabecalho = Array.from({ length: largura }, () => "");
    cabecalho[COL_MATERIAL] = "MATERIAL";
    cabecalho[8] = "Preço Público I - Orgao Antigo";
    cabecalho[9] = "Preço Público"; // vaga sem numeral — 2ª da faixa
    cabecalho[10] = "Preço Público II - Outro Orgao";
    const linhaItem = Array.from({ length: largura }, () => "");
    linhaItem[COL_MATERIAL] = "Link de internet";
    linhaItem[8] = "R$ 10,00";
    linhaItem[10] = "R$ 30,00";

    mockGet([]);
    valuesGetMock.mockResolvedValue({ data: { values: [cabecalho, linhaItem] } });

    await preencherPrecosPublicos("sheet-id", [
      { descricao: "Link de internet", precos: [{ valor: 500, orgao: "MUNICIPIO DE CRATEUS" }] },
    ]);

    const { requests } = structuralBatchUpdateMock.mock.calls[0]![0].requestBody;
    expect(requests).toHaveLength(1);
    expect(requests[0].updateCells.range.startColumnIndex).toBe(9);
    // III, não II: II já é de outra coluna.
    expect(requests[0].updateCells.rows[0].values[0].userEnteredValue.stringValue).toBe(
      "Preço Público III - Municipio De Crateus",
    );
  });

  it("não escreve nada e sinaliza quando a planilha não tem nenhuma coluna 'Preço Público'", async () => {
    mockGet([]);
    const cabecalhoSemColuna = linha("MATERIAL");
    cabecalhoSemColuna[COL_MATERIAL] = "MATERIAL";
    valuesGetMock.mockResolvedValue({
      data: { values: [cabecalhoSemColuna, linha("Cadeira")] },
    });

    const resultado = await preencherPrecosPublicos("sheet-id", [
      { descricao: "Cadeira", precos: [{ valor: 100, orgao: "X" }] },
    ]);

    expect(resultado.linhasPreenchidas).toBe(0);
    expect(resultado.itensSemColunaDisponivel).toEqual([{ descricao: "Cadeira" }]);
    expect(valuesBatchUpdateMock).not.toHaveBeenCalled();
    expect(getMock).toHaveBeenCalledTimes(1); // só o get() de metadados — nunca chega a buscar fonte
  });
});
