"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { extrairSpreadsheetId } from "@/lib/sheets/googleSheets";
import { preencherPrecosPublicos } from "@/lib/sheets/preencherPrecosPublicos";
import type { ActionResult } from "./processos";

const MAX_PRECOS_POR_ITEM = 5;

export interface PreencherCotacaoResultado {
  spreadsheetUrl: string;
  itensPreenchidos: number;
  itensSemCandidato: number;
  itensSemLinhaCorrespondente: string[];
}

export async function preencherCotacao(
  processoId: string,
): Promise<ActionResult<PreencherCotacaoResultado>> {
  const user = await requireAuth();

  const processo = await db.processo.findUnique({
    where: { id: processoId },
    select: { id: true, planilhaOrigemUrl: true },
  });
  if (!processo) {
    return { error: "Processo não encontrado." };
  }
  if (!processo.planilhaOrigemUrl) {
    return {
      error: "Este processo não tem planilha de origem sincronizada. Sincronize a planilha de cotação antes de preencher os preços.",
    };
  }
  const spreadsheetId = extrairSpreadsheetId(processo.planilhaOrigemUrl);
  if (!spreadsheetId) {
    return { error: "Não foi possível identificar o ID da planilha de origem do processo." };
  }

  // `select` explícito nos dois níveis, e não `include` (CLAUDE.md §9.46).
  // Sem ele o Prisma pede TODAS as colunas escalares de `ResultadoSimilaridade`,
  // inclusive `origem`, `conversaId` e `termoBuscaUsado`, que o M13 acrescentou.
  // Código e migration sobem em tempos diferentes (§9.19): entre o deploy e a
  // aplicação da migration, o SELECT referenciaria colunas inexistentes e esta
  // ação quebraria em runtime com "column does not exist" — no meio do
  // preenchimento da planilha de cotação, que é justamente onde o servidor menos
  // pode ser interrompido. Pedir só o que se usa mantém a action compatível com
  // o banco antes e depois da migration.
  const itens = await db.item.findMany({
    where: { processoId },
    select: {
      descricao: true,
      resultadosSimilaridade: {
        orderBy: { scoreFinal: "desc" },
        take: MAX_PRECOS_POR_ITEM,
        select: { valorUnitario: true },
      },
    },
  });

  if (itens.length === 0) {
    return { error: "Processo sem itens. Sincronize a planilha antes de preencher a cotação." };
  }

  const itensParaPreencher = itens.map((item) => ({
    descricao: item.descricao,
    precos: item.resultadosSimilaridade.map((r) => Number(r.valorUnitario)),
  }));

  let resultado;
  try {
    resultado = await preencherPrecosPublicos(spreadsheetId, itensParaPreencher);
  } catch (err) {
    return {
      error: err instanceof Error ? `Falha ao preencher a planilha: ${err.message}` : "Falha ao preencher a planilha.",
    };
  }

  const itensSemCandidato = itensParaPreencher.filter((i) => i.precos.length === 0).length;
  const itensSemLinhaCorrespondente = resultado.linhasNaoEncontradas.map((l) => l.descricao);

  await registrarAuditoria({
    userId: user.id,
    processoId,
    acao: "preencher_cotacao",
    detalhes: {
      spreadsheetId,
      aba: resultado.abaUtilizada,
      totalItens: itens.length,
      itensPreenchidos: resultado.linhasPreenchidas,
      itensSemCandidato,
      itensSemLinhaCorrespondente,
    },
  });

  revalidatePath(`/processos/${processoId}`);

  return {
    data: {
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      itensPreenchidos: resultado.linhasPreenchidas,
      itensSemCandidato,
      itensSemLinhaCorrespondente,
    },
  };
}
