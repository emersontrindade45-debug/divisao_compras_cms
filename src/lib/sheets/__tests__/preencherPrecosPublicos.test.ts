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
