import "server-only";
import { extrairSpreadsheetId } from "./googleSheets";
import { encontrarCabecalho } from "./fornecedoresPlanilha";
import { lerAbaAutenticado } from "./googleAuth";
import { localizarAbaDeDados, getSheetsClientCompartilhado } from "./escreverCandidatoNaPlanilha";

/**
 * CNPJs que já foram trabalhados **neste processo**, lidos da planilha.
 *
 * A exclusão é por processo, não global: uma empresa consultada no 908/2024 deve voltar a aparecer
 * quando o analista abrir o 13137/2024 — ela continua apta a fornecer, só não pode ser consultada
 * duas vezes dentro do mesmo processo. Guardar um booleano global de "já enviado" tornaria a
 * empresa invisível para sempre depois da primeira cotação, esvaziando a base a cada uso.
 *
 * A fonte da verdade é a coluna "Processos Cotação", que já acumula os números por empresa — não
 * uma marcação nova e paralela que poderia divergir dela.
 */
export async function lerCnpjsJaConsultadosNoProcesso(numeroProcesso: string): Promise<Set<string>> {
  const alvo = numeroProcesso.trim();
  if (!alvo) return new Set();

  const planilhaUrl = process.env.FORNECEDORES_SHEETS_URL;
  if (!planilhaUrl) return new Set();

  const spreadsheetId = extrairSpreadsheetId(planilhaUrl);
  if (!spreadsheetId) return new Set();

  const sheets = getSheetsClientCompartilhado();
  const aba = await localizarAbaDeDados(sheets, spreadsheetId);
  const rows = await lerAbaAutenticado(spreadsheetId, aba);

  const cabecalho = encontrarCabecalho(rows);
  if (!cabecalho) return new Set();

  const iCnpj = cabecalho.colunas.cnpj;
  const iProcessos = cabecalho.colunas.processosCotacao;
  if (iCnpj === undefined || iProcessos === undefined) return new Set();

  const consultados = new Set<string>();
  rows.forEach((row, indice) => {
    if (indice === cabecalho.indiceLinha) return;

    const processos = (row[iProcessos] ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (!processos.includes(alvo)) return;

    const cnpj = (row[iCnpj] ?? "").trim();
    if (cnpj) consultados.add(cnpj);
  });

  return consultados;
}
