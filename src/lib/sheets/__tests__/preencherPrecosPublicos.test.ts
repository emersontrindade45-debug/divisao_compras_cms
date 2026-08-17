import { describe, it, expect, vi, beforeEach } from "vitest";

const getMock = vi.fn();
const valuesGetMock = vi.fn();
const batchUpdateMock = vi.fn();

vi.mock("../googleAuth", () => ({
  getSheetsClient: () => ({
    spreadsheets: {
      get: getMock,
      values: { get: valuesGetMock, batchUpdate: batchUpdateMock },
    },
  }),
}));

import { preencherPrecosPublicos } from "../preencherPrecosPublicos";

// Cabeçalho na linha 1, item na linha 2. MATERIAL na coluna H (índice 7,
// como na planilha real — ver fixture de parsePlanilha.test.ts); preço
// público em M:Q (índice 12) e arquivo em R:V (índice 17), independentes de
// onde MATERIAL está.
const COL_MATERIAL = 7;
const COL_PRECO_PUBLICO = 12;
const COL_ARQUIVO = 17;

const CABECALHO = (() => {
  const row = Array.from({ length: 8 }, () => "");
  row[COL_MATERIAL] = "MATERIAL";
  return row;
})();

function linha(material: string, precoPublico: string[] = [], arquivo: string[] = []) {
  const row = Array.from({ length: 22 }, () => "");
  row[COL_MATERIAL] = material;
  precoPublico.forEach((v, i) => (row[COL_PRECO_PUBLICO + i] = v));
  arquivo.forEach((v, i) => (row[COL_ARQUIVO + i] = v));
  return row;
}

beforeEach(() => {
  getMock.mockReset();
  valuesGetMock.mockReset();
  batchUpdateMock.mockReset();
  batchUpdateMock.mockResolvedValue({});
  getMock.mockResolvedValue({ data: { sheets: [{ properties: { title: "Modelo" } }] } });
});

describe("preencherPrecosPublicos", () => {
  it("escreve os preços em M:Q quando a linha nunca teve valor ali", async () => {
    valuesGetMock.mockResolvedValue({
      data: { values: [CABECALHO, linha("Cadeira giratória")] },
    });

    const resultado = await preencherPrecosPublicos("sheet-id", [
      { descricao: "Cadeira giratória", precos: [100, 120] },
    ]);

    expect(resultado.linhasPreenchidas).toBe(1);
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
    const { data } = batchUpdateMock.mock.calls[0]![0].requestBody;
    expect(data).toEqual([{ range: "'Modelo'!M2:N2", values: [[100, 120]] }]);
  });

  it("arquiva o valor pré-existente de M:Q em R:V antes de sobrescrever, na primeira vez", async () => {
    valuesGetMock.mockResolvedValue({
      data: {
        values: [CABECALHO, linha("Cadeira giratória", ["R$ 90,00", "R$ 95,00"])],
      },
    });

    const resultado = await preencherPrecosPublicos("sheet-id", [
      { descricao: "Cadeira giratória", precos: [100, 120] },
    ]);

    // Uma linha "preenchida" do ponto de vista do usuário, mesmo que duas
    // requisições de escrita tenham sido geradas (arquivo + preço novo).
    expect(resultado.linhasPreenchidas).toBe(1);
    const { data } = batchUpdateMock.mock.calls[0]![0].requestBody;
    expect(data).toEqual([
      { range: "'Modelo'!R2:V2", values: [["R$ 90,00", "R$ 95,00", "", "", ""]] },
      { range: "'Modelo'!M2:N2", values: [[100, 120]] },
    ]);
  });

  it("não arquiva de novo quando R:V já tem conteúdo — evita perder o arquivo original", async () => {
    valuesGetMock.mockResolvedValue({
      data: {
        values: [
          CABECALHO,
          linha("Cadeira giratória", ["R$ 100,00"], ["R$ 90,00 (valor manual original)"]),
        ],
      },
    });

    await preencherPrecosPublicos("sheet-id", [
      { descricao: "Cadeira giratória", precos: [130] },
    ]);

    const { data } = batchUpdateMock.mock.calls[0]![0].requestBody;
    expect(data).toEqual([{ range: "'Modelo'!M2:M2", values: [[130]] }]);
  });

  it("não arquiva quando M:Q já está vazio — nada a perder", async () => {
    valuesGetMock.mockResolvedValue({
      data: { values: [CABECALHO, linha("Cadeira giratória")] },
    });

    await preencherPrecosPublicos("sheet-id", [
      { descricao: "Cadeira giratória", precos: [100] },
    ]);

    const { data } = batchUpdateMock.mock.calls[0]![0].requestBody;
    expect(data).toEqual([{ range: "'Modelo'!M2:M2", values: [[100]] }]);
  });
});
