import "server-only";
import { db } from "@/lib/db";
import { getSheetsClient, lerAbaAutenticado } from "@/lib/sheets/googleAuth";
import { carregarConsultasComSemFornecedor } from "@/lib/indicadores/desempenho";
import {
  ABA_CONSULTAS,
  ABA_POR_MES,
  ABA_RESUMO,
  anoEmSp,
  CELULA_CONFERENCIA,
  dataHoraBr,
  montarAbasPlanilha,
  primeiraDiferenca,
  type Celula,
  type CruzamentoGmail,
  type Verificacao,
} from "@/lib/domain/indicadores/planilhaLevantamento";

/**
 * Exporta o levantamento da PLATAFORMA para a planilha do Google (M30.d), de hora em hora. Lê o
 * banco pelas mesmas funções do dashboard, escreve três abas "Plataforma_*" e RELÊ cada uma para
 * provar que a planilha ficou igual ao que foi calculado. As abas `Lev_*` (script do Gmail) não são
 * tocadas — só lidas, para o cruzamento de envios e destinatários.
 *
 * Duas proteções contra "o dashboard abriu vazio e a planilha foi sobrescrita com zeros":
 *  - leitura do banco que devolve zero consultas para envios existentes aborta ANTES de escrever
 *    (`carregarConsultasComSemFornecedor` engole erro e devolve lista vazia — ver §9.93);
 *  - escreve primeiro, limpa a sobra depois: nunca há instante com a aba vazia.
 *
 * Nenhum texto de e-mail passa por aqui.
 */

const LARGURA_MAXIMA = 26;
const FOLGA_LINHAS = 100;

export interface ResultadoExportacao {
  ano: number;
  envios: number;
  consultas: number;
  linhasConsultas: number;
  verificacoes: { nome: string; resultado: "OK" | "DIVERGE" | "NÃO CONFERIDO"; detalhe: string }[];
  /** Todas as abas voltaram da planilha idênticas ao que foi calculado. */
  releituraOk: boolean;
}

export function planilhaDoLevantamento(): string | null {
  const id = process.env.LEVANTAMENTO_PLANILHA_ID?.trim();
  return id ? id : null;
}

async function contarLinhas(planilhaId: string, aba: string): Promise<number | null> {
  try {
    const m = await lerAbaAutenticado(planilhaId, aba);
    return m.slice(1).filter((l) => (l[0] ?? "").trim() !== "").length;
  } catch {
    return null;
  }
}

/**
 * Lê uma aba SEM formatação (`UNFORMATTED_VALUE`): a planilha está em pt-BR e devolveria 64,7 e
 * 17.804 formatados, o que viraria diferença falsa contra o número que foi gravado.
 */
async function lerSemFormatar(planilhaId: string, aba: string): Promise<string[][]> {
  const res = await getSheetsClient().spreadsheets.values.get({
    spreadsheetId: planilhaId,
    range: `'${aba}'`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return (res.data.values ?? []).map((l) => l.map((c) => String(c ?? "")));
}

/** Garante as abas e o tamanho da grade (a padrão tem 1.000 linhas e a de consultas passa disso). */
async function prepararAbas(planilhaId: string, tamanhos: Record<string, number>): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: planilhaId,
    fields: "sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))",
  });
  const existentes = new Map(
    (meta.data.sheets ?? []).map((s) => [s.properties?.title ?? "", s.properties] as const),
  );
  const pedidos: object[] = [];
  for (const [titulo, linhas] of Object.entries(tamanhos)) {
    const precisa = linhas + FOLGA_LINHAS;
    const atual = existentes.get(titulo);
    if (!atual) {
      pedidos.push({ addSheet: { properties: { title: titulo, gridProperties: { rowCount: precisa, columnCount: LARGURA_MAXIMA } } } });
    } else if ((atual.gridProperties?.rowCount ?? 0) < precisa || (atual.gridProperties?.columnCount ?? 0) < LARGURA_MAXIMA) {
      pedidos.push({
        updateSheetProperties: {
          properties: {
            sheetId: atual.sheetId,
            gridProperties: {
              rowCount: Math.max(precisa, atual.gridProperties?.rowCount ?? 0),
              columnCount: Math.max(LARGURA_MAXIMA, atual.gridProperties?.columnCount ?? 0),
            },
          },
          fields: "gridProperties.rowCount,gridProperties.columnCount",
        },
      });
    }
  }
  if (pedidos.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: planilhaId, requestBody: { requests: pedidos } });
  }
}

/** Escreve a matriz a partir de A1 e só DEPOIS limpa o que sobrou abaixo. RAW: nada vira fórmula. */
async function escreverAba(planilhaId: string, aba: string, valores: Celula[][]): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: planilhaId,
    range: `'${aba}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: valores },
  });
  await sheets.spreadsheets.values.clear({
    spreadsheetId: planilhaId,
    range: `'${aba}'!A${valores.length + 1}:Z`,
  });
}

function rotulo(v: Verificacao): "OK" | "DIVERGE" | "NÃO CONFERIDO" {
  return v.ok === null ? "NÃO CONFERIDO" : v.ok ? "OK" : "DIVERGE";
}

export async function exportarLevantamento(userId: string, agora: Date = new Date()): Promise<ResultadoExportacao> {
  const planilhaId = planilhaDoLevantamento();
  if (!planilhaId) throw new Error("LEVANTAMENTO_PLANILHA_ID não configurada.");

  const ano = anoEmSp(agora);
  const desde = new Date(`${ano}-01-01T00:00:00-03:00`);

  const [consultas, envios, respondidas] = await Promise.all([
    carregarConsultasComSemFornecedor(desde, null),
    db.envioCotacao.findMany({
      where: { dataEnvio: { gte: desde } },
      select: { dataEnvio: true, totalDestinatarios: true },
    }),
    db.consultaCotacao.findMany({
      where: { envio: { dataEnvio: { gte: desde } }, situacao: { not: "sem_resposta" } },
      select: {
        email: true,
        situacao: true,
        regra: true,
        dataResposta: true,
        gmailRespostaId: true,
        envio: { select: { gmailMensagemId: true } },
      },
    }),
  ]);

  // O dashboard engole erro de leitura e devolve []: com envios no banco, isso é falha, não "zero".
  if (envios.length > 0 && consultas.length === 0) {
    throw new Error("A leitura das consultas voltou vazia com envios no banco: a planilha NÃO foi alterada.");
  }

  const gmail: CruzamentoGmail = {
    envios: await contarLinhas(planilhaId, "Lev_Envios"),
    destinatarios: await contarLinhas(planilhaId, "Lev_Destinatarios"),
  };

  const abas = montarAbasPlanilha({
    ano,
    agora,
    consultas,
    envios,
    gmail,
    linhas: respondidas.map((r) => ({
      envioGmailId: r.envio.gmailMensagemId,
      email: r.email,
      situacao: r.situacao,
      regra: r.regra,
      dataResposta: r.dataResposta,
      respostaGmailId: r.gmailRespostaId,
    })),
  });

  await prepararAbas(planilhaId, {
    [ABA_RESUMO]: abas.resumo.length,
    [ABA_POR_MES]: abas.porMes.length,
    [ABA_CONSULTAS]: abas.consultas.length,
  });
  await escreverAba(planilhaId, ABA_RESUMO, abas.resumo);
  await escreverAba(planilhaId, ABA_POR_MES, abas.porMes);
  await escreverAba(planilhaId, ABA_CONSULTAS, abas.consultas);

  // Releitura: a planilha tem de voltar IGUAL ao que foi calculado.
  const [lidoResumo, lidoMes, lidoConsultas] = await Promise.all([
    lerSemFormatar(planilhaId, ABA_RESUMO),
    lerSemFormatar(planilhaId, ABA_POR_MES),
    lerSemFormatar(planilhaId, ABA_CONSULTAS),
  ]);
  const diferencas = [
    [ABA_RESUMO, primeiraDiferenca(abas.resumo, lidoResumo)],
    [ABA_POR_MES, primeiraDiferenca(abas.porMes, lidoMes)],
    [ABA_CONSULTAS, primeiraDiferenca(abas.consultas, lidoConsultas)],
  ].filter((d): d is [string, string] => d[1] !== null);
  const releituraOk = diferencas.length === 0;

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: planilhaId,
    range: `'${ABA_RESUMO}'!${String.fromCharCode(65 + CELULA_CONFERENCIA.coluna)}${CELULA_CONFERENCIA.linha + 1}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[releituraOk ? `OK (${dataHoraBr(new Date())})` : `DIVERGE: ${diferencas.map(([a, d]) => `${a} ${d}`).join("; ")}`]],
    },
  });

  const resultado: ResultadoExportacao = {
    ano,
    envios: envios.length,
    consultas: consultas.filter((c) => !c.semFornecedor).length,
    linhasConsultas: abas.consultas.length - 1,
    verificacoes: abas.verificacoes.map((v) => ({ nome: v.nome, resultado: rotulo(v), detalhe: v.detalhe })),
    releituraOk,
  };

  await db.auditLog.create({
    data: {
      userId,
      acao: "exportar_levantamento_planilha",
      detalhes: {
        ano: resultado.ano,
        envios: resultado.envios,
        consultas: resultado.consultas,
        linhasConsultas: resultado.linhasConsultas,
        releituraOk,
        divergencias: resultado.verificacoes.filter((v) => v.resultado === "DIVERGE").map((v) => v.nome),
      },
    },
  });
  return resultado;
}
