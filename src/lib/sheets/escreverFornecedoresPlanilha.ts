// Sem `import "server-only"` deliberadamente (CLAUDE.md §9.62):
// scripts/escrever-fornecedores-planilha.ts chama este módulo via tsx, fora do
// bundler do Next. Não é importado por `components/`.
import { db } from "@/lib/db";
import { rangeA1, rangeAba } from "./colunaA1";
import { encontrarCabecalho } from "./fornecedoresPlanilha";
import { getSheetsClient } from "./googleAuth";
import { extrairSpreadsheetId } from "./googleSheets";
import {
  planejarEscritaFornecedoresPlanilha,
  type AtualizacaoCelulaPlanilha,
  type FornecedorParaPlanilha,
  type PlanoEscritaFornecedoresPlanilha,
} from "./planejarEscritaFornecedoresPlanilha";

/** Tamanho de cada `values.batchUpdate`. 571 células já caberam num único lote (PLAN M24, 2026-08-19). */
export const TAMANHO_LOTE_ESCRITA_PLANILHA = 400;

const SELECT_FORNECEDOR_PARA_PLANILHA = {
  id: true,
  origemPlanilhaLinhaId: true,
  razaoSocial: true,
  categoria: true,
  cidade: true,
  estado: true,
  email: true,
  emailsAdicionais: true,
  telefone: true,
} as const;

export interface ResultadoEscritaFornecedoresPlanilha {
  abaUtilizada: string;
  dryRun: boolean;
  celulasEscritas: number;
  lotesEnviados: number;
  atualizacoes: AtualizacaoCelulaPlanilha[];
  resumo: PlanoEscritaFornecedoresPlanilha["resumo"];
}

export interface OpcoesEscritaFornecedoresPlanilha {
  dryRun?: boolean;
  limite?: number;
  spreadsheetId?: string;
  gid?: number;
  tamanhoLote?: number;
}

function extrairGid(url: string): number | null {
  const m = url.match(/[?&#]gid=(\d+)/);
  return m ? Number(m[1]) : null;
}

function matrizComoTexto(values: unknown): string[][] {
  if (!Array.isArray(values)) return [];
  return values.map((row) => {
    if (!Array.isArray(row)) return [];
    return row.map((cell) => (cell == null ? "" : String(cell)));
  });
}

function fatiar<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}

function resolverSpreadsheetId(opcoes: OpcoesEscritaFornecedoresPlanilha): {
  spreadsheetId: string;
  url: string;
} {
  const url = process.env.FORNECEDORES_SHEETS_URL ?? "";
  const spreadsheetId = opcoes.spreadsheetId ?? extrairSpreadsheetId(url);
  if (!spreadsheetId) {
    throw new Error(
      "FORNECEDORES_SHEETS_URL não está configurada ou não é uma URL de planilha Google válida.",
    );
  }
  return { spreadsheetId, url };
}

async function localizarAbaEValores(
  spreadsheetId: string,
  gidPreferido: number,
): Promise<{ aba: string; valores: string[][] }> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title,sheets.properties.sheetId",
  });
  const abas = (meta.data.sheets ?? [])
    .map((s) => ({ title: s.properties?.title, sheetId: s.properties?.sheetId }))
    .filter((s): s is { title: string; sheetId: number } => !!s.title && s.sheetId != null);

  if (abas.length === 0) {
    throw new Error("A planilha de fornecedores não tem nenhuma aba.");
  }

  const escolhida = abas.find((s) => s.sheetId === gidPreferido) ?? abas[0]!;
  const leitura = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: rangeAba(escolhida.title, "A:Z"),
  });
  const valores = matrizComoTexto(leitura.data.values);

  if (valores.length === 0) {
    throw new Error(`A aba "${escolhida.title}" está vazia.`);
  }
  if (!encontrarCabecalho(valores)) {
    throw new Error(
      `Cabeçalho da planilha de fornecedores não encontrado na aba "${escolhida.title}" (coluna CPF/CNPJ).`,
    );
  }

  return { aba: escolhida.title, valores };
}

/**
 * Lê a planilha de fornecedores e o cadastro `Fornecedor`, planeja as células a
 * preencher (só vazias, salvo razão social divergente) e grava via Sheets API.
 * `--dry-run` no script chama isto com `dryRun: true` e não dispara `batchUpdate`.
 */
export async function escreverFornecedoresPlanilha(
  opcoes: OpcoesEscritaFornecedoresPlanilha = {},
): Promise<ResultadoEscritaFornecedoresPlanilha> {
  const dryRun = opcoes.dryRun === true;
  const { spreadsheetId, url } = resolverSpreadsheetId(opcoes);
  const gid = opcoes.gid ?? extrairGid(url) ?? 0;
  const tamanhoLote = opcoes.tamanhoLote ?? TAMANHO_LOTE_ESCRITA_PLANILHA;

  const { aba, valores } = await localizarAbaEValores(spreadsheetId, gid);

  const registros = await db.fornecedor.findMany({
    where: { origemPlanilhaLinhaId: { not: null } },
    select: SELECT_FORNECEDOR_PARA_PLANILHA,
    take: opcoes.limite,
  });

  const fornecedores: FornecedorParaPlanilha[] = registros.flatMap((f) => {
    if (f.origemPlanilhaLinhaId == null) return [];
    return [
      {
        origemPlanilhaLinhaId: f.origemPlanilhaLinhaId,
        razaoSocial: f.razaoSocial,
        categoria: f.categoria,
        cidade: f.cidade,
        estado: f.estado,
        email: f.email,
        emailsAdicionais: f.emailsAdicionais,
        telefone: f.telefone,
      },
    ];
  });

  const { atualizacoes, resumo } = planejarEscritaFornecedoresPlanilha(valores, fornecedores);

  if (dryRun || atualizacoes.length === 0) {
    return {
      abaUtilizada: aba,
      dryRun,
      celulasEscritas: 0,
      lotesEnviados: 0,
      atualizacoes,
      resumo,
    };
  }

  const sheets = getSheetsClient();
  const lotes = fatiar(atualizacoes, tamanhoLote);
  for (const lote of lotes) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: lote.map((a) => ({
          range: rangeA1(aba, a.coluna, a.linhaPlanilha),
          values: [[a.valorNovo]],
        })),
      },
    });
  }

  return {
    abaUtilizada: aba,
    dryRun: false,
    celulasEscritas: atualizacoes.length,
    lotesEnviados: lotes.length,
    atualizacoes,
    resumo,
  };
}
