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
  it("escreve um preço por coluna disponível quando há colunas de sobra", async () => {
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
    // Todas as 12: o teto não pode cortar abaixo do que a planilha comporta.
    expect(data).toHaveLength(COLUNAS);
    // Cada um na sua coluna — nunca dois preços na mesma célula.
    expect(data.map((d: { values: number[][] }) => d.values[0]![0])).toEqual(
      Array.from({ length: COLUNAS }, (_, i) => 100 + i),
    );
    expect(new Set(data.map((d: { range: string }) => d.range)).size).toBe(COLUNAS);
    expect(resultado.linhasPreenchidas).toBe(1);
  });

  // O teto existe como válvula de segurança, não como o limite do dia a dia:
  // quem manda é o número de colunas da planilha. O número vai à mão — com a
  // constante na asserção, uma volta a 10 passaria verde (§9.105).
  it("respeita o teto de preços por item quando a planilha tem mais colunas que ele", async () => {
    const COLUNAS = 60;
    const largura = 8 + COLUNAS;
    const cabecalho = Array.from({ length: largura }, () => "");
    cabecalho[COL_MATERIAL] = "MATERIAL";
    for (let i = 0; i < COLUNAS; i += 1) cabecalho[8 + i] = "Preço Público";
    const linhaVazia = Array.from({ length: largura }, () => "");
    linhaVazia[COL_MATERIAL] = "Link de internet";

    mockGet([]);
    valuesGetMock.mockResolvedValue({ data: { values: [cabecalho, linhaVazia] } });

    await preencherPrecosPublicos("sheet-id", [
      {
        descricao: "Link de internet",
        precos: Array.from({ length: COLUNAS }, (_, i) => ({ valor: 100 + i, orgao: `ORGAO ${i}` })),
      },
    ]);

    const { data } = valuesBatchUpdateMock.mock.calls[0]![0].requestBody;
    expect(data).toHaveLength(50);
    expect(MAX_PRECOS_POR_ITEM).toBe(50);
  });

  // Planilha real do processo 0736/2025, depois que o usuário ampliou a faixa
  // copiando a primeira coluna: as 33 colunas ficaram com o rótulo idêntico
  // "Preço Público I ". Reaproveitar o numeral escrito renomearia as 33 para
  // "Preço Público I - <Órgão>", e a memória de cálculo passaria a citar 33
  // preços indistinguíveis — a ambiguidade que a regra existe para evitar.
  it("renumera colunas cujo numeral escrito está repetido, em vez de propagar o repetido", async () => {
    const COLUNAS = 33;
    const largura = 8 + COLUNAS;
    const cabecalho = Array.from({ length: largura }, () => "");
    cabecalho[COL_MATERIAL] = "MATERIAL";
    // Rótulo idêntico em todas, com o espaço final que está na planilha real.
    for (let i = 0; i < COLUNAS; i += 1) cabecalho[8 + i] = "Preço Público I ";
    const linhaVazia = Array.from({ length: largura }, () => "");
    linhaVazia[COL_MATERIAL] = "Link de internet";

    mockGet([]);
    valuesGetMock.mockResolvedValue({ data: { values: [cabecalho, linhaVazia] } });

    await preencherPrecosPublicos("sheet-id", [
      {
        descricao: "Link de internet",
        precos: Array.from({ length: COLUNAS }, (_, i) => ({ valor: 100 + i, orgao: `ORGAO ${i}` })),
      },
    ]);

    const { requests } = structuralBatchUpdateMock.mock.calls[0]![0].requestBody;
    const rotulos = requests.map(
      (r: { updateCells: { rows: { values: { userEnteredValue: { stringValue: string } }[] }[] } }) =>
        r.updateCells.rows[0]!.values[0]!.userEnteredValue.stringValue,
    );
    expect(rotulos).toHaveLength(COLUNAS);

    const numerais = rotulos.map((t: string) => /Preço Público (\S+) -/.exec(t)![1]);
    // O que importa: nenhum numeral se repete. São 33 colunas, 33 numerais.
    expect(new Set(numerais).size).toBe(COLUNAS);
    expect(numerais.slice(0, 4)).toEqual(["I", "II", "III", "IV"]);
    expect(numerais[32]).toBe("XXXIII");
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

// Caso real do processo 0736/2025 (2026-09-18), com a planilha já preenchida
// uma vez. O cabeçalho é por COLUNA e vale para todas as linhas, mas a coluna
// era escolhida por LINHA ("a primeira vazia desta linha"), então o rótulo
// acabava sendo o do último item preenchido e mentia sobre os demais: a coluna
// "Preço Público III - Inst De Prev … Petropolis" guardava R$ 874,00 (Ferraz)
// na MFP colorida, R$ 570,00 (Ferraz) na MFP PB e R$ 10.500,00 (Petrópolis) na
// Impressora de Cartão.
describe("coluna por órgão, não por posição na linha", () => {
  function planilhaCom(colunas: number, itens: string[]) {
    const largura = 8 + colunas;
    const cabecalho = Array.from({ length: largura }, () => "");
    cabecalho[COL_MATERIAL] = "MATERIAL";
    for (let i = 0; i < colunas; i += 1) cabecalho[8 + i] = "Preço Público I ";
    const linhas = itens.map((descricao) => {
      const linha = Array.from({ length: largura }, () => "");
      linha[COL_MATERIAL] = descricao;
      return linha;
    });
    return [cabecalho, ...linhas];
  }

  /** colIdx -> { rotulo, valores por item } a partir do que foi enviado à API. */
  function escritas() {
    const { data } = valuesBatchUpdateMock.mock.calls[0]![0].requestBody;
    return (data as { range: string; values: number[][] }[]).map((d) => ({
      coluna: /!([A-Z]+)\d+$/.exec(d.range)![1],
      linha: /(\d+)$/.exec(d.range)![1],
      valor: d.values[0]![0],
    }));
  }

  function rotulos() {
    const { requests } = structuralBatchUpdateMock.mock.calls[0]![0].requestBody;
    const mapa = new Map<number, string>();
    (requests as {
      updateCells: {
        range: { startColumnIndex: number };
        rows: { values: { userEnteredValue: { stringValue: string } }[] }[];
      };
    }[]).forEach((r) => {
      mapa.set(
        r.updateCells.range.startColumnIndex,
        r.updateCells.rows[0]!.values[0]!.userEnteredValue.stringValue,
      );
    });
    return mapa;
  }

  it("põe o mesmo órgão na mesma coluna em todos os itens", async () => {
    mockGet([]);
    valuesGetMock.mockResolvedValue({
      data: { values: planilhaCom(6, ["MFP colorida A4", "MFP PB A4"]) },
    });

    await preencherPrecosPublicos("sheet-id", [
      {
        descricao: "MFP colorida A4",
        // Ferraz é o 3º aqui e o 4º no item seguinte: a ordem dentro do item
        // não pode decidir a coluna.
        precos: [
          { valor: 66990, orgao: "MUNICIPIO DE VARGEM GRANDE PAULISTA" },
          { valor: 1055.65, orgao: "ESTADO DO CEARA" },
          { valor: 874, orgao: "MUNICIPIO DE FERRAZ DE VASCONCELOS" },
        ],
      },
      {
        descricao: "MFP PB A4",
        precos: [
          { valor: 180, orgao: "MUNICIPIO DE CAMPO MOURAO" },
          { valor: 223.94, orgao: "CAMARA MUNICIPAL DE CURITIBA" },
          { valor: 208.35, orgao: "ESTADO DO CEARA" },
          { valor: 570, orgao: "MUNICIPIO DE FERRAZ DE VASCONCELOS" },
        ],
      },
    ]);

    const porValor = new Map(escritas().map((e) => [e.valor, e.coluna]));
    // Ceará nas duas linhas, mesma coluna.
    expect(porValor.get(1055.65)).toBe(porValor.get(208.35));
    // Ferraz nas duas linhas, mesma coluna.
    expect(porValor.get(874)).toBe(porValor.get(570));
    // E órgãos diferentes nunca compartilham coluna.
    expect(porValor.get(1055.65)).not.toBe(porValor.get(874));
    expect(porValor.get(66990)).not.toBe(porValor.get(180));
  });

  it("rotula cada coluna com o órgão cujos preços ela guarda", async () => {
    mockGet([]);
    valuesGetMock.mockResolvedValue({
      data: { values: planilhaCom(6, ["MFP colorida A4", "MFP PB A4"]) },
    });

    await preencherPrecosPublicos("sheet-id", [
      {
        descricao: "MFP colorida A4",
        precos: [{ valor: 874, orgao: "MUNICIPIO DE FERRAZ DE VASCONCELOS" }],
      },
      {
        descricao: "MFP PB A4",
        precos: [
          { valor: 180, orgao: "MUNICIPIO DE CAMPO MOURAO" },
          { valor: 570, orgao: "MUNICIPIO DE FERRAZ DE VASCONCELOS" },
        ],
      },
    ]);

    const escritos = escritas();
    const colunaDeFerraz = escritos.find((e) => e.valor === 874)!.coluna;
    const colunaDeCampoMourao = escritos.find((e) => e.valor === 180)!.coluna;
    const idx = (letra: string) => letra.charCodeAt(0) - 65;

    expect(rotulos().get(idx(colunaDeFerraz))).toContain("Ferraz De Vasconcelos");
    expect(rotulos().get(idx(colunaDeCampoMourao))).toContain("Campo Mourao");
    // O segundo preço de Ferraz (570) confirma o rótulo em vez de trocá-lo.
    expect(escritos.find((e) => e.valor === 570)!.coluna).toBe(colunaDeFerraz);
  });

  // O mesmo órgão pode ter dois preços para o MESMO item (Brusque, em
  // "Impressora de Cartão"), e uma coluna guarda um valor por linha. A 2ª
  // ocorrência precisa de coluna própria — também rotulada com aquele órgão.
  it("dá coluna própria ao segundo preço do mesmo órgão no mesmo item", async () => {
    mockGet([]);
    valuesGetMock.mockResolvedValue({
      data: { values: planilhaCom(6, ["Impressora de Cartão"]) },
    });

    await preencherPrecosPublicos("sheet-id", [
      {
        descricao: "Impressora de Cartão",
        precos: [
          { valor: 6999.98, orgao: "MUNICIPIO DE BRUSQUE" },
          { valor: 7700, orgao: "MUNICIPIO DE BRUSQUE" },
          { valor: 16800, orgao: "PRESIDENCIA DA REPUBLICA" },
        ],
      },
    ]);

    const escritos = escritas();
    const c1 = escritos.find((e) => e.valor === 6999.98)!.coluna;
    const c2 = escritos.find((e) => e.valor === 7700)!.coluna;
    expect(c1).not.toBe(c2);

    const idx = (letra: string) => letra.charCodeAt(0) - 65;
    expect(rotulos().get(idx(c1))).toContain("Brusque");
    expect(rotulos().get(idx(c2))).toContain("Brusque");
    // Numerais distintos: a memória de cálculo precisa distinguir os dois.
    expect(rotulos().get(idx(c1))).not.toBe(rotulos().get(idx(c2)));
  });

  // Antes, o último recurso era escrever na coluna de OUTRO órgão. Preço na
  // coluna errada é pior que preço ausente: a memória de cálculo passaria a
  // atribuir o valor a quem não o praticou.
  it("deixa de escrever em vez de usar a coluna de outro órgão quando faltam colunas", async () => {
    mockGet([]);
    valuesGetMock.mockResolvedValue({
      data: { values: planilhaCom(2, ["Impressora de Cartão"]) },
    });

    const resultado = await preencherPrecosPublicos("sheet-id", [
      {
        descricao: "Impressora de Cartão",
        precos: [
          { valor: 100, orgao: "ORGAO A" },
          { valor: 200, orgao: "ORGAO B" },
          { valor: 300, orgao: "ORGAO C" },
        ],
      },
    ]);

    const escritos = escritas();
    expect(escritos.map((e) => e.valor)).toEqual([100, 200]);
    expect(new Set(escritos.map((e) => e.coluna)).size).toBe(2);
    expect(resultado.itensSemColunaDisponivel).toEqual([{ descricao: "Impressora de Cartão" }]);
  });
});

// Dois defeitos achados lendo a planilha real do processo 0736/2025 em
// 2026-09-18, ambos invisíveis para quem só olha o resultado na tela.
describe("leitura da planilha real", () => {
  /** Responde a leitura de valores: formatada e, quando pedida, com fórmulas. */
  function mockLeituras(valores: string[][], formulas?: string[][]) {
    valuesGetMock.mockImplementation((params: { valueRenderOption?: string }) =>
      Promise.resolve({
        data: { values: params.valueRenderOption === "FORMULA" ? (formulas ?? valores) : valores },
      }),
    );
  }

  // A faixa lida era "A1:Z500", que para na coluna Z (índice 25). A planilha
  // tem 33 colunas "Preço Público" indo até AV (índice 47): as 22 além de Z
  // eram invisíveis, e o analista via a faixa que criou ser ignorada.
  it("lê a aba inteira, sem parar numa coluna fixa", async () => {
    const largura = 48;
    const cabecalho = Array.from({ length: largura }, () => "");
    cabecalho[COL_MATERIAL] = "MATERIAL";
    for (let i = 15; i < largura; i += 1) cabecalho[i] = "Preço Público I ";
    const linhaItem = Array.from({ length: largura }, () => "");
    linhaItem[COL_MATERIAL] = "Impressora de Cartão";

    mockGet([]);
    mockLeituras([cabecalho, linhaItem]);

    // 20 órgãos distintos: só cabem se as colunas além de Z forem enxergadas.
    await preencherPrecosPublicos("sheet-id", [
      {
        descricao: "Impressora de Cartão",
        precos: Array.from({ length: 20 }, (_, i) => ({ valor: 100 + i, orgao: `ORGAO ${i}` })),
      },
    ]);

    // A asserção decisiva é no pedido feito à API, não num intermediário: era
    // ali que a faixa era cortada (§9.99).
    const faixas = valuesGetMock.mock.calls.map((c) => (c[0] as { range: string }).range);
    faixas.forEach((faixa) => expect(faixa).not.toMatch(/![A-Z]+\d*:[A-Z]+\d*$/));

    const { data } = valuesBatchUpdateMock.mock.calls[0]![0].requestBody;
    expect(data).toHaveLength(20);
    // Pelo menos um preço caiu além da coluna Z — o que antes era impossível.
    const colunas = (data as { range: string }[]).map((d) => /!([A-Z]+)\d+$/.exec(d.range)![1]);
    expect(colunas.some((c) => c.length > 1)).toBe(true);
  });

  // A linha TOTAL tem `=SUM(P3:P7)` em todas as colunas da faixa. Lendo só o
  // resultado, toda coluna "tem valor" — e como nenhuma tem órgão no cabeçalho,
  // todas seriam classificadas como ocupadas por desconhecido, não sobraria
  // coluna livre e o preenchimento não escreveria NADA.
  it("não confunde a linha de total com preço já lançado", async () => {
    const largura = 20;
    const cabecalho = Array.from({ length: largura }, () => "");
    cabecalho[COL_MATERIAL] = "MATERIAL";
    for (let i = 15; i < largura; i += 1) cabecalho[i] = "Preço Público I ";

    const linhaItem = Array.from({ length: largura }, () => "");
    linhaItem[COL_MATERIAL] = "Impressora de Cartão";

    const linhaTotal = Array.from({ length: largura }, () => "");
    linhaTotal[COL_MATERIAL] = "TOTAL";
    const linhaTotalFormula = [...linhaTotal];
    for (let i = 15; i < largura; i += 1) {
      linhaTotal[i] = "R$ -"; // o que a leitura formatada devolve
      linhaTotalFormula[i] = `=SUM(${String.fromCharCode(80 + i - 15)}3:${String.fromCharCode(80 + i - 15)}7)`;
    }

    mockGet([]);
    mockLeituras([cabecalho, linhaItem, linhaTotal], [cabecalho, linhaItem, linhaTotalFormula]);

    const resultado = await preencherPrecosPublicos("sheet-id", [
      {
        descricao: "Impressora de Cartão",
        precos: [
          { valor: 13800, orgao: "SECRETARIA DE ESTADO DA EDUCACAO" },
          { valor: 9698.99, orgao: "SECRETARIA DE EDUCACAO E ESPORTES" },
        ],
      },
    ]);

    const { data } = valuesBatchUpdateMock.mock.calls[0]![0].requestBody;
    expect(data).toHaveLength(2);
    expect(resultado.itensSemColunaDisponivel).toEqual([]);
    expect(resultado.linhasPreenchidas).toBe(1);
  });
});
