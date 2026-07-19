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

  const processo = await db.processo.findUnique({ where: { id: processoId } });
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

  const itens = await db.item.findMany({
    where: { processoId },
    include: {
      resultadosSimilaridade: {
        orderBy: { scoreFinal: "desc" },
        take: MAX_PRECOS_POR_ITEM,
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
