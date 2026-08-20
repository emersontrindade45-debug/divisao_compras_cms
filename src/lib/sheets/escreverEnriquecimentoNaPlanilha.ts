import "server-only";
import { fetchText, csvUrl, extrairSpreadsheetId } from "./googleSheets";
import { parseCsv } from "./csv";
import { encontrarCabecalho } from "./fornecedoresPlanilha";
import { normalizarTexto } from "@/lib/domain/normalizarMunicipio";
import { getSheetsClient } from "./googleAuth";

/**
 * Escreve de volta na planilha Google de fornecedores (M24) os campos que o enriquecimento por
 * CNPJ (M26) preencheu no banco — sem isso, a próxima sincronização do M24 (que copia célula
 * VAZIA da planilha para o banco em cada `ON CONFLICT DO UPDATE`) apagaria Cidade/UF/Telefone/
 * E-mail/Tags que o M26 buscou na Receita, porque a planilha nunca recebeu esse dado de volta.
 *
 * Mesma regra do M26 em `enriquecerFornecedoresPorCnpj.ts`: só escreve em célula VAZIA da
 * planilha — nunca sobrescreve dado já lá, manual ou de outra origem. Telefone é tratado como
 * "vazio" só quando AMBAS as colunas de telefone (`Telefone`/`Telefone 2`) estão vazias, mesma
 * regra usada para decidir se o M26 preenche `Fornecedor.telefone`. Razão social é a ÚNICA
 * exceção — sobrescreve quando diverge (normalizado), porque o CNPJ é chave exata e a Receita é
 * fonte de verdade para esse campo específico (mesma justificativa do M26).
 *
 * Casa pela mesma chave do M24 (`origemPlanilhaLinhaId` ↔ coluna "#"), nunca por CNPJ — a
 * planilha pode ter mais de um `Fornecedor` só distinguível por linha.
 */

export interface CandidatoEnriquecido {
  origemPlanilhaLinhaId: string;
  razaoSocial: string;
  cidade: string;
  estado: string;
  categoria: string[];
  email: string;
  telefone: string | null;
}

export interface ResultadoEscritaEnriquecimento {
  linhasAtualizadas: number;
  linhasNaoEncontradas: string[];
  /** Contagem de CAMPOS (não linhas) descartados por já haver valor na planilha. */
  camposIgnoradosPorJaPreenchidos: number;
}

interface AtualizacaoCelula {
  range: string;
  valor: string;
}

/** 0-based → letra de coluna A1 (0 → A, 25 → Z, 26 → AA...). Mesmo helper de preencherPrecosPublicos.ts. */
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

function normalizarRazaoSocial(s: string): string {
  return normalizarTexto(s).replace(/\s+/g, " ");
}

/**
 * Título da aba de dados, para montar o `range` do `batchUpdate`. Mesma regra de
 * `escreverCandidatoNaPlanilha.ts`: cai na PRIMEIRA aba quando não há nenhuma com
 * `sheetId === 0` — a planilha real de fornecedores não tem essa aba (CLAUDE.md §9.63).
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

export async function escreverEnriquecimentoNaPlanilha(
  candidatos: CandidatoEnriquecido[],
  opcoes: { dryRun?: boolean } = {},
): Promise<ResultadoEscritaEnriquecimento> {
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
  const { indiceLinha, colunas } = cabecalho;

  const sheets = getSheetsClient();
  const abaTitulo = await localizarAbaDeDados(sheets, spreadsheetId);

  // linhaId (coluna "#") -> índice 0-based da linha na matriz `rows`.
  const indicePorLinhaId = new Map<string, number>();
  for (let i = indiceLinha + 1; i < rows.length; i++) {
    const valor = (rows[i]?.[colunas.linhaId!] ?? "").trim();
    if (valor) indicePorLinhaId.set(valor, i);
  }

  const atualizacoes: AtualizacaoCelula[] = [];
  const linhasNaoEncontradas: string[] = [];
  let camposIgnorados = 0;
  const linhasComAtualizacao = new Set<string>();

  const celulaVazia = (idx: number | undefined, row: string[]): boolean =>
    idx === undefined || !(row[idx] ?? "").trim();

  for (const candidato of candidatos) {
    const indiceRow = indicePorLinhaId.get(candidato.origemPlanilhaLinhaId);
    if (indiceRow === undefined) {
      linhasNaoEncontradas.push(candidato.origemPlanilhaLinhaId);
      continue;
    }

    const row = rows[indiceRow] ?? [];
    const linhaPlanilha1Based = indiceRow + 1;

    const escrever = (campo: string, valor: string) => {
      const idx = colunas[campo];
      if (idx === undefined) return; // planilha sem essa coluna — nada a fazer
      atualizacoes.push({
        range: `'${abaTitulo}'!${letraColuna(idx)}${linhaPlanilha1Based}`,
        valor,
      });
      linhasComAtualizacao.add(candidato.origemPlanilhaLinhaId);
    };

    if (candidato.cidade && celulaVazia(colunas.cidade, row)) {
      escrever("cidade", candidato.cidade);
    } else if (candidato.cidade) {
      camposIgnorados++;
    }

    if (candidato.estado && celulaVazia(colunas.estado, row)) {
      escrever("estado", candidato.estado);
    } else if (candidato.estado) {
      camposIgnorados++;
    }

    const tel1Vazia = celulaVazia(colunas.telefone, row);
    const tel2Vazia = celulaVazia(colunas.telefone2, row);
    if (candidato.telefone && tel1Vazia && tel2Vazia) {
      escrever("telefone", candidato.telefone);
    } else if (candidato.telefone) {
      camposIgnorados++;
    }

    if (candidato.email && celulaVazia(colunas.email, row)) {
      escrever("email", candidato.email);
    } else if (candidato.email) {
      camposIgnorados++;
    }

    if (candidato.categoria.length > 0 && celulaVazia(colunas.categoria, row)) {
      escrever("categoria", candidato.categoria.join(", "));
    } else if (candidato.categoria.length > 0) {
      camposIgnorados++;
    }

    const razaoSocialAtual = (row[colunas.razaoSocial!] ?? "").trim();
    if (
      candidato.razaoSocial &&
      razaoSocialAtual &&
      normalizarRazaoSocial(razaoSocialAtual) !== normalizarRazaoSocial(candidato.razaoSocial)
    ) {
      escrever("razaoSocial", candidato.razaoSocial);
    }
  }

  if (atualizacoes.length > 0 && !opcoes.dryRun) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: atualizacoes.map((a) => ({ range: a.range, values: [[a.valor]] })),
      },
    });
  }

  return {
    linhasAtualizadas: linhasComAtualizacao.size,
    linhasNaoEncontradas,
    camposIgnoradosPorJaPreenchidos: camposIgnorados,
  };
}
