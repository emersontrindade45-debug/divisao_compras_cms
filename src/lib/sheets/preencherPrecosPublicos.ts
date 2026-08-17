import "server-only";
import { getSheetsClient } from "./googleAuth";

const MAX_PRECOS_POR_ITEM = 5;
// Tamanho de fonte padrão do Sheets quando a célula não tem formatação
// explícita — usado só se a leitura do cabeçalho não devolver um valor.
const TAMANHO_FONTE_PADRAO = 10;
const LIMITE_NOME_ORGAO = 45;

export interface PrecoParaPreencher {
  valor: number;
  /** Órgão/fornecedor da fonte — vai para o rótulo da coluna, não para a célula de valor. */
  orgao: string;
}

export interface ItemParaPreencher {
  descricao: string;
  precos: PrecoParaPreencher[];
}

export interface LinhaNaoEncontrada {
  descricao: string;
}

export interface PreenchimentoResultado {
  abaUtilizada: string;
  linhasPreenchidas: number;
  linhasNaoEncontradas: LinhaNaoEncontrada[];
  /**
   * Item cuja linha foi encontrada mas não tinha nenhuma coluna "Preço
   * Público" vazia para receber preço novo — nem sem coluna do tipo na
   * planilha, nem com todas já ocupadas. Ver `localizarColunasPrecoPublico`.
   */
  itensSemColunaDisponivel: LinhaNaoEncontrada[];
}

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const ALGARISMOS_ROMANOS: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

function paraRomano(numero: number): string {
  let resto = numero;
  let saida = "";
  for (const [valor, simbolo] of ALGARISMOS_ROMANOS) {
    while (resto >= valor) {
      saida += simbolo;
      resto -= valor;
    }
  }
  return saida;
}

/** 0-based → letra de coluna A1 (0 → A, 25 → Z, 26 → AA...). */
function letraColuna(indice: number): string {
  let n = indice + 1;
  let letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

// O PNCP devolve razão social em CAIXA ALTA ("CAMARA MUNICIPAL DE AMERICO
// BRASILIENSE"), ilegível espremido num cabeçalho de coluna. Não tenta
// replicar abreviação editorial (o usuário, à mão, chegou a "Câmara Américo
// Brasiliense" — cortando "MUNICIPAL DE"); aqui só normaliza capitalização e
// corta pelo tamanho, sem juízo sobre quais palavras descartar.
function abreviarOrgao(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, " ");
  const titulo = limpo
    .toLowerCase()
    .split(" ")
    .map((p) => (p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(" ");
  return titulo.length > LIMITE_NOME_ORGAO
    ? `${titulo.slice(0, LIMITE_NOME_ORGAO - 1).trimEnd()}…`
    : titulo;
}

// Casa "Preço Público", "PREÇO PÚBLICO I", "preco publico ii - fulano" etc.
// — texto normalizado (sem acento/caixa) para a detecção da coluna.
const PREFIXO_PRECO_PUBLICO = "preco publico";
// Extrai o numeral já presente no texto ORIGINAL (não normalizado), se houver,
// para reaproveitar a numeração que já está na planilha em vez de recalcular.
const REGEX_NUMERAL = /pre[çc]o\s+p[úu]blico\s*([ivxlcdm]+|\d+)?/i;

/** Colunas cujo cabeçalho começa com "Preço Público", na ordem em que aparecem. */
function localizarColunasPrecoPublico(headerRow: string[]): number[] {
  const indices: number[] = [];
  headerRow.forEach((cel, idx) => {
    if (normalizar(cel ?? "").startsWith(PREFIXO_PRECO_PUBLICO)) indices.push(idx);
  });
  return indices;
}

/** Encontra a linha (1-based) de cada item na aba, casando pelo texto da coluna MATERIAL. */
function localizarLinhas(valoresAba: string[][], colunaMaterial: number): Map<string, number> {
  const linhaPorMaterial = new Map<string, number>();
  valoresAba.forEach((row, idx) => {
    const material = (row[colunaMaterial] ?? "").trim();
    if (!material) return;
    linhaPorMaterial.set(normalizar(material), idx + 1);
  });
  return linhaPorMaterial;
}

interface AbaDeDados {
  aba: string;
  sheetId: number;
  valores: string[][];
  colunaMaterial: number;
  /** Índice 0-based da linha onde "MATERIAL" foi encontrado (normalmente a linha 1). */
  linhaCabecalho: number;
  headerRow: string[];
}

/** Procura, em todas as abas da planilha, a primeira com cabeçalho "MATERIAL". */
async function localizarAbaDeDados(spreadsheetId: string): Promise<AbaDeDados> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title,sheets.properties.sheetId",
  });
  const abas = (meta.data.sheets ?? [])
    .map((s) => ({ title: s.properties?.title, sheetId: s.properties?.sheetId }))
    .filter((s): s is { title: string; sheetId: number } => !!s.title && s.sheetId != null);

  for (const { title: aba, sheetId } of abas) {
    const leitura = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${aba}'!A1:Z500`,
    });
    const valores = leitura.data.values ?? [];
    const linhaCabecalho = valores.findIndex((row) =>
      row.some((cell) => (cell ?? "").trim().toUpperCase() === "MATERIAL"),
    );
    if (linhaCabecalho >= 0) {
      const headerRow = valores[linhaCabecalho]!;
      const colunaMaterial = headerRow.findIndex(
        (cell) => (cell ?? "").trim().toUpperCase() === "MATERIAL",
      );
      return { aba, sheetId, valores, colunaMaterial, linhaCabecalho, headerRow };
    }
  }

  throw new Error(
    `Nenhuma aba com cabeçalho "MATERIAL" encontrada na planilha. Abas disponíveis: ${abas.map((a) => a.title).join(", ")}.`,
  );
}

/**
 * Lê o tamanho de fonte já aplicado à primeira coluna "Preço Público" do
 * cabeçalho, para usar como base do rótulo novo (a IN 65 não dita fonte —
 * isso é só para o rótulo escrito por código não destoar visualmente do
 * que já está na planilha). Sem formatação explícita, cai no padrão do
 * Sheets (10pt).
 */
async function descobrirTamanhoFonteBase(
  spreadsheetId: string,
  aba: string,
  linhaCabecalho: number,
  colunaReferencia: number,
): Promise<number> {
  const sheets = getSheetsClient();
  const range = `'${aba}'!${letraColuna(colunaReferencia)}${linhaCabecalho + 1}`;
  const resposta = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [range],
    fields: "sheets.data.rowData.values.userEnteredFormat.textFormat.fontSize",
  });
  const fontSize =
    resposta.data.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0]?.userEnteredFormat?.textFormat
      ?.fontSize;
  return fontSize ?? TAMANHO_FONTE_PADRAO;
}

/**
 * Preenche as colunas "Preço Público" na planilha real do processo
 * (sincronizada previamente): detecta a aba de dados pelo cabeçalho
 * MATERIAL, casa cada item por esse texto, e localiza as colunas de preço
 * pelo PRÓPRIO RÓTULO ("Preço Público I", "II"...) em vez de uma posição
 * fixa — planilhas diferentes têm números diferentes de colunas de
 * fornecedor direto antes das colunas públicas, então M:Q fixo em uma
 * planilha cai em cima de cotação de fornecedor em outra.
 *
 * Só escreve em cédulas de valor VAZIAS (nunca sobrescreve preço já
 * lançado ali, manual ou de sincronização anterior) e, ao escrever, também
 * atualiza o cabeçalho daquela coluna para "Preço Público N - Órgão", com
 * o nome do órgão em fonte 50% menor que o rótulo — feito via
 * `textFormatRuns`, que o `values.batchUpdate` (usado para os valores) não
 * suporta.
 *
 * Limitação conhecida: o rótulo do cabeçalho é por COLUNA, não por linha —
 * numa planilha com vários itens compartilhando as mesmas colunas de preço
 * público, o nome do órgão exibido reflete a última escrita, não
 * necessariamente o órgão usado em toda linha daquela coluna.
 */
export async function preencherPrecosPublicos(
  spreadsheetId: string,
  itens: ItemParaPreencher[],
): Promise<PreenchimentoResultado> {
  const sheets = getSheetsClient();
  const { aba, sheetId, valores, colunaMaterial, linhaCabecalho, headerRow } =
    await localizarAbaDeDados(spreadsheetId);
  const linhaPorMaterial = localizarLinhas(valores, colunaMaterial);
  const colunasPrecoPublico = localizarColunasPrecoPublico(headerRow);

  const linhasNaoEncontradas: LinhaNaoEncontrada[] = [];
  const itensSemColunaDisponivel: LinhaNaoEncontrada[] = [];

  if (colunasPrecoPublico.length === 0) {
    return {
      abaUtilizada: aba,
      linhasPreenchidas: 0,
      linhasNaoEncontradas: [],
      itensSemColunaDisponivel: itens.map((i) => ({ descricao: i.descricao })),
    };
  }

  const fonteBase = await descobrirTamanhoFonteBase(
    spreadsheetId,
    aba,
    linhaCabecalho,
    colunasPrecoPublico[0]!,
  );
  const fonteOrgao = Math.max(1, Math.round(fonteBase / 2));

  const dataValores: { range: string; values: number[][] }[] = [];
  const cabecalhosParaAtualizar = new Map<number, string>(); // colIdx -> texto completo
  let linhasPreenchidas = 0;

  for (const item of itens) {
    if (item.precos.length === 0) continue;
    const linha = linhaPorMaterial.get(normalizar(item.descricao));
    if (!linha) {
      linhasNaoEncontradas.push({ descricao: item.descricao });
      continue;
    }

    const linhaAtual = valores[linha - 1] ?? [];
    const colunasVazias = colunasPrecoPublico.filter((idx) => !(linhaAtual[idx] ?? "").trim());
    if (colunasVazias.length === 0) {
      itensSemColunaDisponivel.push({ descricao: item.descricao });
      continue;
    }

    const precos = item.precos.slice(0, Math.min(MAX_PRECOS_POR_ITEM, colunasVazias.length));
    precos.forEach((preco, i) => {
      const colIdx = colunasVazias[i]!;
      dataValores.push({
        range: `'${aba}'!${letraColuna(colIdx)}${linha}`,
        values: [[preco.valor]],
      });

      const posicao = colunasPrecoPublico.indexOf(colIdx) + 1;
      const numeralExistente = REGEX_NUMERAL.exec(headerRow[colIdx] ?? "")?.[1];
      const numeral = numeralExistente ?? paraRomano(posicao);
      cabecalhosParaAtualizar.set(colIdx, `Preço Público ${numeral} - ${abreviarOrgao(preco.orgao)}`);
    });
    linhasPreenchidas += 1;
  }

  if (dataValores.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data: dataValores },
    });
  }

  if (cabecalhosParaAtualizar.size > 0) {
    const requests = [...cabecalhosParaAtualizar.entries()].map(([colIdx, texto]) => {
      const prefixoLen = texto.indexOf(" - ") + 3; // inclui " - " no trecho em tamanho normal
      return {
        updateCells: {
          rows: [
            {
              values: [
                {
                  userEnteredValue: { stringValue: texto },
                  textFormatRuns: [
                    { startIndex: 0, format: { fontSize: fonteBase } },
                    { startIndex: prefixoLen, format: { fontSize: fonteOrgao } },
                  ],
                },
              ],
            },
          ],
          fields: "userEnteredValue,textFormatRuns",
          range: {
            sheetId,
            startRowIndex: linhaCabecalho,
            endRowIndex: linhaCabecalho + 1,
            startColumnIndex: colIdx,
            endColumnIndex: colIdx + 1,
          },
        },
      };
    });
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }

  return { abaUtilizada: aba, linhasPreenchidas, linhasNaoEncontradas, itensSemColunaDisponivel };
}
