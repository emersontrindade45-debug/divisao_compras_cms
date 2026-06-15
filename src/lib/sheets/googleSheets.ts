/**
 * Leitura de planilhas públicas do Google Sheets sem dependências nem
 * autenticação. Usa o endpoint `gviz/tq?tqx=out:csv` (acessível para planilhas
 * compartilhadas como "qualquer pessoa com o link") e a página `htmlview` para
 * descobrir as abas e o título do arquivo (que contém o número do processo).
 */
import { parseCsv } from "./csv";
import { isDataSheet } from "./parsePlanilha";

export interface PlanilhaCarregada {
  numeroProcesso: string | null;
  titulo: string | null;
  rows: string[][];
  abaNome: string | null;
}

export function extrairSpreadsheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([\w-]+)/) ?? url.match(/[?&]id=([\w-]+)/);
  return m?.[1] ?? null;
}

function extrairTitulo(html: string): string | null {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  if (!m) return null;
  return m[1]!.replace(/\s*-\s*Google\s+(Sheets|Drive|Docs)\s*$/i, "").trim() || null;
}

/** Extrai o número do processo do título do arquivo (ex.: "...Proc_2433/2025" → "2433/2025"). */
export function extrairNumeroProcesso(titulo: string | null): string | null {
  if (!titulo) return null;
  const m = titulo.match(/proc[._\s-]*([\d]{1,6})\s*\/\s*(\d{2,4})/i);
  if (m) return `${m[1]}/${m[2]}`;
  return null;
}

function extrairAbas(html: string): Array<{ name: string; gid: string }> {
  const abas: Array<{ name: string; gid: string }> = [];
  const re = /name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    abas.push({ name: m[1]!.replace(/\\(.)/g, "$1"), gid: m[2]! });
  }
  if (abas.length === 0) {
    const gids = new Set<string>();
    const gre = /gid=(\d+)/g;
    let g: RegExpExecArray | null;
    while ((g = gre.exec(html))) gids.add(g[1]!);
    for (const gid of gids) abas.push({ name: "", gid });
  }
  return abas;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; DivisaoComprasBot/1.0)" },
  });
  if (!res.ok) {
    throw new Error(`Falha ao acessar o Google Sheets (HTTP ${res.status}).`);
  }
  return res.text();
}

function csvUrl(id: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

/**
 * Carrega a aba de dados da planilha pública e o número do processo.
 * Lança erro com mensagem amigável se a planilha não for acessível.
 */
export async function carregarPlanilha(url: string): Promise<PlanilhaCarregada> {
  const id = extrairSpreadsheetId(url);
  if (!id) {
    throw new Error("URL inválida: não foi possível identificar o ID da planilha.");
  }

  const html = await fetchText(`https://docs.google.com/spreadsheets/d/${id}/htmlview`);
  const titulo = extrairTitulo(html);
  const numeroProcesso = extrairNumeroProcesso(titulo);
  const abas = extrairAbas(html);

  if (abas.length === 0) {
    // sem abas detectadas — tenta a primeira aba (gid=0)
    abas.push({ name: "", gid: "0" });
  }

  for (const aba of abas) {
    let rows: string[][];
    try {
      const csv = await fetchText(csvUrl(id, aba.gid));
      rows = parseCsv(csv);
    } catch {
      continue;
    }
    if (isDataSheet(rows)) {
      return { numeroProcesso, titulo, rows, abaNome: aba.name || null };
    }
  }

  throw new Error(
    "Nenhuma aba de dados encontrada (esperado um cabeçalho 'MATERIAL'). Verifique se a planilha está compartilhada como pública.",
  );
}
