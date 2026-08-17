"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { extrairSpreadsheetId } from "@/lib/sheets/googleSheets";
import { preencherPrecosPublicos } from "@/lib/sheets/preencherPrecosPublicos";
import { valorUnitarioEfetivo } from "@/lib/domain/roteiroCalculo";
import type { ActionResult } from "./processos";

const MAX_PRECOS_POR_ITEM = 5;

export interface PreencherCotacaoResultado {
  spreadsheetUrl: string;
  itensPreenchidos: number;
  itensSemCandidato: number;
  itensSemLinhaCorrespondente: string[];
  itensSemColunaDisponivel: string[];
}

export interface SincronizarItemResultado {
  sincronizado: boolean;
  motivo?: string;
}

/**
 * Escreve os melhores preços de contratações similares de UM item na planilha
 * de cotação de origem do processo — mesma escrita de `preencherPrecosPublicos`,
 * mas disparada automaticamente ao promover um candidato para Fonte
 * (`promoverFonte.ts`), sem exigir o clique manual em "Preencher cotação"
 * depois. Melhor esforço, de propósito: processo sem planilha vinculada,
 * planilha sem edição liberada para o service account ou qualquer outra falha
 * de escrita não podem derrubar a promoção, que já foi persistida no banco —
 * o retorno só informa o chamador para fins de auditoria.
 */
export async function sincronizarItemComPlanilha(
  itemId: string,
): Promise<SincronizarItemResultado> {
  try {
    const item = await db.item.findUnique({
      where: { id: itemId },
      select: {
        descricao: true,
        processo: { select: { planilhaOrigemUrl: true } },
        resultadosSimilaridade: {
          orderBy: { scoreFinal: "desc" },
          take: MAX_PRECOS_POR_ITEM,
          select: { valorUnitario: true, valorConsiderado: true, fonteOrgaoOuId: true },
        },
      },
    });
    if (!item) return { sincronizado: false, motivo: "Item não encontrado" };
    if (!item.processo.planilhaOrigemUrl) {
      return { sincronizado: false, motivo: "Processo sem planilha de origem sincronizada" };
    }

    const spreadsheetId = extrairSpreadsheetId(item.processo.planilhaOrigemUrl);
    if (!spreadsheetId) {
      return { sincronizado: false, motivo: "URL de planilha de origem inválida" };
    }
    if (item.resultadosSimilaridade.length === 0) {
      return { sincronizado: false, motivo: "Nenhum candidato de preço público para o item" };
    }

    const resultado = await preencherPrecosPublicos(spreadsheetId, [
      {
        descricao: item.descricao,
        // Valor ajustado pelo roteiro de cálculo (TR) tem prioridade sobre o
        // bruto publicado pela fonte — mesma prioridade usada ao promover
        // para Fonte (`promoverFonte.ts`). Sem isso, um ajuste feito depois
        // da promoção nunca chegaria à planilha.
        precos: item.resultadosSimilaridade.map((r) => ({
          valor: valorUnitarioEfetivo({
            valorUnitario: Number(r.valorUnitario),
            valorConsiderado: r.valorConsiderado == null ? null : Number(r.valorConsiderado),
          }),
          orgao: r.fonteOrgaoOuId,
        })),
      },
    ]);
    if (resultado.linhasPreenchidas === 0) {
      const motivo =
        resultado.itensSemColunaDisponivel.length > 0
          ? "Nenhuma coluna 'Preço Público' vazia disponível na planilha para este item"
          : "Item sem linha correspondente na planilha";
      return { sincronizado: false, motivo };
    }
    return { sincronizado: true };
  } catch (err) {
    return {
      sincronizado: false,
      motivo: err instanceof Error ? err.message : "Falha ao escrever na planilha",
    };
  }
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
        select: { valorUnitario: true, valorConsiderado: true, fonteOrgaoOuId: true },
      },
    },
  });

  if (itens.length === 0) {
    return { error: "Processo sem itens. Sincronize a planilha antes de preencher a cotação." };
  }

  const itensParaPreencher = itens.map((item) => ({
    descricao: item.descricao,
    // Valor ajustado pelo roteiro de cálculo (TR), quando existir, no lugar
    // do bruto publicado pela fonte — mesma prioridade de `promoverFonte.ts`.
    precos: item.resultadosSimilaridade.map((r) => ({
      valor: valorUnitarioEfetivo({
        valorUnitario: Number(r.valorUnitario),
        valorConsiderado: r.valorConsiderado === null ? null : Number(r.valorConsiderado),
      }),
      orgao: r.fonteOrgaoOuId,
    })),
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
  const itensSemColunaDisponivel = resultado.itensSemColunaDisponivel.map((l) => l.descricao);

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
      itensSemColunaDisponivel,
    },
  });

  revalidatePath(`/processos/${processoId}`);

  return {
    data: {
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      itensPreenchidos: resultado.linhasPreenchidas,
      itensSemCandidato,
      itensSemLinhaCorrespondente,
      itensSemColunaDisponivel,
    },
  };
}
