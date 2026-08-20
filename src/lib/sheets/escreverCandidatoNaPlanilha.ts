import "server-only";
import { fetchText, csvUrl, extrairSpreadsheetId } from "./googleSheets";
import { parseCsv } from "./csv";
import { encontrarCabecalho, parseFornecedoresPlanilha } from "./fornecedoresPlanilha";
import { getSheetsClient } from "./googleAuth";

/**
 * Escreve um candidato a Fornecedor (`EmpresaCandidataFornecedor`, M27) como
 * linha nova na planilha Google de fornecedores (M24) — a planilha continua
 * sendo o registro mestre; isto NÃO cria `Fornecedor` diretamente (ver
 * decisão registrada em docs/PLAN.md M27 etapa 6). O sync manual existente
 * (`/api/admin/sincronizar-fornecedores`) já faz o upsert a partir da linha
 * nova, e o parser dele (`parseFornecedoresPlanilha`) já tolera CNPJ/e-mail
 * ausentes — exatamente a situação da maioria dos candidatos da Receita.
 */

export const FONTE_CANDIDATOS_CNPJ = "M27 — Receita Federal";

export interface CandidatoParaPlanilha {
  /** Mascarado XX.XXX.XXX/XXXX-XX — mesmo formato de `FornecedorPlanilhaRow.cnpj`. */
  cnpj: string;
  razaoSocial: string;
  cidade: string;
  estado: string;
  email: string;
  telefone: string;
  fonte: string;
}

interface CamposLinhaPlanilha extends CandidatoParaPlanilha {
  linhaId: string;
}

/**
 * Monta o array de células de uma linha nova respeitando a posição REAL de
 * cada coluna no cabeçalho (`colunas`, saída de `encontrarCabecalho`) — nunca
 * uma ordem fixa, porque a planilha pode ter as colunas reordenadas. Campo
 * sem correspondência no cabeçalho (`Situação`, `Processos Cotação`, etc.)
 * fica em branco. `largura` é o comprimento da linha de cabeçalho — a linha
 * montada nunca é mais curta que ele, mesmo se algum campo mapear para um
 * índice além do que os campos conhecidos preenchem.
 */
export function montarLinhaPlanilha(
  colunas: Record<string, number>,
  largura: number,
  campos: CamposLinhaPlanilha,
): string[] {
  const linha = Array.from({ length: largura }, () => "");

  const preencher = (campo: string, valor: string) => {
    const indice = colunas[campo];
    if (indice === undefined) return;
    // Coluna mapeada além da largura conhecida (cabeçalho maior que o
    // esperado numa leitura futura) — estende a linha em vez de descartar.
    while (linha.length <= indice) linha.push("");
    linha[indice] = valor;
  };

  preencher("linhaId", campos.linhaId);
  preencher("razaoSocial", campos.razaoSocial);
  preencher("cnpj", campos.cnpj);
  preencher("cidade", campos.cidade);
  preencher("estado", campos.estado);
  preencher("email", campos.email);
  preencher("telefone", campos.telefone);
  preencher("fonte", campos.fonte);

  return linha;
}

/**
 * Próximo valor da coluna "#" (linhaId), sempre `maior valor numérico já
 * usado + 1`. Planilha vazia → "1". Valor não numérico (célula corrompida) é
 * ignorado no cálculo do máximo, nunca derruba a função.
 */
export function proximoLinhaId(linhas: { linhaId: string }[]): string {
  let maior = 0;
  for (const linha of linhas) {
    const numero = Number(linha.linhaId);
    if (Number.isFinite(numero) && numero > maior) maior = numero;
  }
  return String(maior + 1);
}

export interface ResultadoAdicionarCandidato {
  linhaId: string;
  /** `true` quando o CNPJ já estava na planilha — nada foi escrito de novo (dedupe). */
  jaExistente: boolean;
}

/**
 * Título da aba de dados, para montar o `range` do `append`.
 *
 * É a PRIMEIRA aba da planilha, não a de `sheetId === 0`: a planilha real de
 * fornecedores ("01. FORNECEDORES_OFICIAL") não tem nenhuma aba com id 0 — os
 * ids são 1106271462 (Fornecedores), 1709422097 (Cotações Ativas), 382288013,
 * 1507387464 e 953776461. `sheetId` 0 só existe na primeira aba de planilhas
 * criadas do zero e que nunca tiveram essa aba recriada; procurá-lo fazia o
 * botão do M27 falhar em produção antes de escrever qualquer coisa.
 *
 * "Primeira aba" é consistente com o caminho de LEITURA logo acima: o gviz
 * resolve `gid=0` como a primeira aba, e não como a aba de id 0 — medido em
 * 2026-08-20, `gid=0` e `gid=1106271462` devolvem o mesmo CSV de 5.452 linhas.
 * Os dois lados apontam para a mesma aba.
 */
async function localizarAbaDeDados(
  sheets: ReturnType<typeof getSheetsClient>,
  spreadsheetId: string,
): Promise<string> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title,sheets.properties.sheetId",
  });
  const abas = meta.data.sheets ?? [];
  const aba =
    abas.find((s) => s.properties?.sheetId === 0)?.properties?.title ?? abas[0]?.properties?.title;
  if (!aba) {
    throw new Error("Não foi possível localizar a aba de dados na planilha de fornecedores.");
  }
  return aba;
}

/**
 * Lê a planilha pública de fornecedores (mesmo caminho de leitura do M24:
 * `FORNECEDORES_SHEETS_URL`, `gid=0`), calcula o próximo `linhaId` e checa se
 * o CNPJ do candidato já está lá (dedupe — sem precisar de campo de estado
 * novo em `EmpresaCandidataFornecedor`). Se não estiver, adiciona a linha ao
 * final via `values.append` (`INSERT_ROWS`).
 */
export async function adicionarCandidatoNaPlanilha(
  candidato: CandidatoParaPlanilha,
): Promise<ResultadoAdicionarCandidato> {
  const planilhaUrl = process.env.FORNECEDORES_SHEETS_URL;
  if (!planilhaUrl) {
    throw new Error("FORNECEDORES_SHEETS_URL não está configurada.");
  }

  const spreadsheetId = extrairSpreadsheetId(planilhaUrl);
  if (!spreadsheetId) {
    throw new Error("FORNECEDORES_SHEETS_URL não é uma URL de planilha Google válida.");
  }

  const csv = await fetchText(csvUrl(spreadsheetId, "0"));
  const rows = parseCsv(csv);

  const cabecalho = encontrarCabecalho(rows);
  if (!cabecalho) {
    throw new Error("Não foi possível localizar o cabeçalho da planilha de fornecedores.");
  }

  const { linhas } = parseFornecedoresPlanilha(rows);

  const existente = linhas.find((l) => l.cnpj === candidato.cnpj);
  if (existente) {
    return { linhaId: existente.linhaId, jaExistente: true };
  }

  const linhaId = proximoLinhaId(linhas);
  const headerRow = rows[cabecalho.indiceLinha] ?? [];
  const linhaMontada = montarLinhaPlanilha(cabecalho.colunas, headerRow.length, {
    ...candidato,
    linhaId,
  });

  const sheets = getSheetsClient();
  const aba = await localizarAbaDeDados(sheets, spreadsheetId);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${aba}'!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [linhaMontada] },
  });

  return { linhaId, jaExistente: false };
}
