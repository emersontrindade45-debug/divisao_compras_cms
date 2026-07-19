import "server-only";
import { getSheetsClient } from "./googleAuth";

const MAX_PRECOS_POR_ITEM = 5;
// Colunas M a Q ("PREÇO PÚBLICO I" a "V") na planilha modelo de mediana.
const COLUNAS_PRECO_PUBLICO = ["M", "N", "O", "P", "Q"] as const;

export interface ItemParaPreencher {
  descricao: string;
  precos: number[];
}

export interface LinhaNaoEncontrada {
  descricao: string;
}

export interface PreenchimentoResultado {
  abaUtilizada: string;
  linhasPreenchidas: number;
  linhasNaoEncontradas: LinhaNaoEncontrada[];
}

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
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

/** Procura, em todas as abas da planilha, a primeira com cabeçalho "MATERIAL". */
async function localizarAbaDeDados(
  spreadsheetId: string,
): Promise<{ aba: string; valores: string[][]; colunaMaterial: number }> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const nomesAbas = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => !!t);

  for (const aba of nomesAbas) {
    const leitura = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${aba}'!A1:Z500`,
    });
    const valores = leitura.data.values ?? [];
    const headerRow = valores.find((row) =>
      row.some((cell) => (cell ?? "").trim().toUpperCase() === "MATERIAL"),
    );
    if (headerRow) {
      const colunaMaterial = headerRow.findIndex(
        (cell) => (cell ?? "").trim().toUpperCase() === "MATERIAL",
      );
      return { aba, valores, colunaMaterial };
    }
  }

  throw new Error(
    `Nenhuma aba com cabeçalho "MATERIAL" encontrada na planilha. Abas disponíveis: ${nomesAbas.join(", ")}.`,
  );
}

/**
 * Preenche as colunas de Preço Público (M-Q) na planilha real do processo
 * (sincronizada previamente), detectando automaticamente a aba de dados e
 * casando cada item pelo texto da coluna MATERIAL — nunca por posição.
 */
export async function preencherPrecosPublicos(
  spreadsheetId: string,
  itens: ItemParaPreencher[],
): Promise<PreenchimentoResultado> {
  const sheets = getSheetsClient();
  const { aba, valores, colunaMaterial } = await localizarAbaDeDados(spreadsheetId);
  const linhaPorMaterial = localizarLinhas(valores, colunaMaterial);

  const data: { range: string; values: number[][] }[] = [];
  const linhasNaoEncontradas: LinhaNaoEncontrada[] = [];

  for (const item of itens) {
    if (item.precos.length === 0) continue;
    const linha = linhaPorMaterial.get(normalizar(item.descricao));
    if (!linha) {
      linhasNaoEncontradas.push({ descricao: item.descricao });
      continue;
    }
    const precos = item.precos.slice(0, MAX_PRECOS_POR_ITEM);
    const colunaFinal = COLUNAS_PRECO_PUBLICO[precos.length - 1];
    data.push({
      range: `'${aba}'!M${linha}:${colunaFinal}${linha}`,
      values: [precos],
    });
  }

  if (data.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data },
    });
  }

  return { abaUtilizada: aba, linhasPreenchidas: data.length, linhasNaoEncontradas };
}
