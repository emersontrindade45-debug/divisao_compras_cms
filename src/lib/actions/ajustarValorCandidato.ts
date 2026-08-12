"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import {
  BASES_VALOR_SERIE,
  OPERACOES_AJUSTE,
  PERIODICIDADES_CONTRATO,
  calcularValorConsiderado,
  calcularValorUnitarioAjustado,
} from "@/lib/domain/ajusteValorCandidato";
import type { ActionResult } from "./processos";

const ajustarSchema = z.object({
  resultadoId: z.string().cuid(),
  valorBase: z.number().finite(),
  operacao: z.enum(OPERACOES_AJUSTE),
  quantidade: z.number().finite(),
  // String vazia = campo não preenchido; normalizada para null.
  unidadeMedida: z.string().trim().max(40).nullable(),
  quantidadeTR: z.number().finite().positive().nullable(),
  periodicidade: z.enum(PERIODICIDADES_CONTRATO).nullable(),
  // Qual dos dois números vai para a série: o resultado do cálculo ou ele
  // multiplicado pela quantidade do TR.
  baseSerie: z.enum(BASES_VALOR_SERIE),
});

export type EntradaAjusteCandidato = z.input<typeof ajustarSchema>;

/**
 * Grava o ajuste manual do valor de um candidato de similaridade e propaga o
 * novo preço para a estimativa quando o candidato já foi promovido a Fonte.
 *
 * Conformidade: o preço que entra na série passa a ser o ajustado, e os
 * operandos ficam gravados na própria linha para o auditor refazer a conta
 * (IN 65/2021 — memória de cálculo). A propagação acontece na MESMA transação
 * do ajuste: candidato, Fonte e PrecoConsolidado divergirem entre si seria uma
 * estimativa que ninguém consegue justificar. A série não é reconsolidada aqui
 * — `consolidarSeriePreco` continua sendo passo explícito do analista.
 */
export async function ajustarValorCandidato(
  input: EntradaAjusteCandidato,
): Promise<ActionResult<{ valorConsiderado: number }>> {
  const user = await requireRole("pesquisa");

  const parsed = ajustarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const { resultadoId, valorBase, operacao, quantidade } = parsed.data;

  const calculo = calcularValorUnitarioAjustado({ valorBase, operacao, quantidade });
  if (!calculo.ok) return { error: calculo.erro };

  const considerado = calcularValorConsiderado({
    valorUnitario: calculo.valorUnitario,
    base: parsed.data.baseSerie,
    quantidadeTR: parsed.data.quantidadeTR,
  });
  if (!considerado.ok) return { error: considerado.erro };

  // `select` explícito e enxuto (CLAUDE.md §9.46): entre o deploy do código e a
  // aplicação da migration, um SELECT que peça as colunas novas quebraria.
  const resultado = await db.resultadoSimilaridade.findUnique({
    where: { id: resultadoId },
    select: {
      id: true,
      valorUnitario: true,
      promovidoParaFonte: true,
      item: { select: { id: true, processoId: true } },
    },
  });
  if (!resultado) return { error: "Candidato não encontrado" };

  const unidadeMedida = parsed.data.unidadeMedida?.trim() || null;

  await db.$transaction(async (tx) => {
    await tx.resultadoSimilaridade.update({
      where: { id: resultado.id },
      data: {
        ajusteValorBase: valorBase,
        ajusteOperacao: operacao,
        ajusteQuantidade: quantidade,
        ajusteUnidadeMedida: unidadeMedida,
        ajusteQuantidadeTR: parsed.data.quantidadeTR,
        ajustePeriodicidade: parsed.data.periodicidade,
        valorUnitarioAjustado: calculo.valorUnitario,
        ajusteBaseSerie: parsed.data.baseSerie,
        valorConsiderado: considerado.valor,
      },
    });

    if (resultado.promovidoParaFonte) {
      await tx.fonte.updateMany({
        where: { resultadoSimilaridadeId: resultado.id },
        data: { valorUnitario: considerado.valor },
      });
      await tx.precoConsolidado.updateMany({
        where: { resultadoSimilaridadeId: resultado.id },
        data: { valorUnitario: considerado.valor },
      });
    }
  });

  await registrarAuditoria({
    userId: user.id,
    processoId: resultado.item.processoId,
    acao: "ajustar_valor_candidato_similaridade",
    detalhes: {
      resultadoId: resultado.id,
      itemId: resultado.item.id,
      valorOriginalFonte: Number(resultado.valorUnitario),
      valorBase,
      operacao,
      quantidade,
      unidadeMedida,
      quantidadeTR: parsed.data.quantidadeTR,
      periodicidade: parsed.data.periodicidade,
      valorUnitarioAjustado: calculo.valorUnitario,
      baseSerie: parsed.data.baseSerie,
      valorConsiderado: considerado.valor,
      propagadoParaSerie: resultado.promovidoParaFonte,
    },
  });

  revalidatePath(`/processos/${resultado.item.processoId}`);

  return { data: { valorConsiderado: considerado.valor } };
}

/**
 * Desfaz o ajuste: o candidato volta a valer pelo valor publicado pela fonte, e
 * a série (se ele já foi promovido) volta junto. Sem isto, um ajuste digitado
 * errado só teria conserto por outro ajuste — e o candidato ficaria para sempre
 * marcado como corrigido à mão na memória de cálculo.
 */
export async function limparAjusteValorCandidato(
  resultadoId: string,
): Promise<ActionResult<{ valorUnitario: number }>> {
  const user = await requireRole("pesquisa");

  const parsed = z.string().cuid().safeParse(resultadoId);
  if (!parsed.success) return { error: "Dados inválidos" };

  const resultado = await db.resultadoSimilaridade.findUnique({
    where: { id: parsed.data },
    select: {
      id: true,
      valorUnitario: true,
      promovidoParaFonte: true,
      item: { select: { id: true, processoId: true } },
    },
  });
  if (!resultado) return { error: "Candidato não encontrado" };

  const valorOriginal = Number(resultado.valorUnitario);

  await db.$transaction(async (tx) => {
    await tx.resultadoSimilaridade.update({
      where: { id: resultado.id },
      data: {
        ajusteValorBase: null,
        ajusteOperacao: null,
        ajusteQuantidade: null,
        ajusteUnidadeMedida: null,
        ajusteQuantidadeTR: null,
        ajustePeriodicidade: null,
        valorUnitarioAjustado: null,
        ajusteBaseSerie: null,
        valorConsiderado: null,
      },
    });

    if (resultado.promovidoParaFonte) {
      await tx.fonte.updateMany({
        where: { resultadoSimilaridadeId: resultado.id },
        data: { valorUnitario: resultado.valorUnitario },
      });
      await tx.precoConsolidado.updateMany({
        where: { resultadoSimilaridadeId: resultado.id },
        data: { valorUnitario: resultado.valorUnitario },
      });
    }
  });

  await registrarAuditoria({
    userId: user.id,
    processoId: resultado.item.processoId,
    acao: "limpar_ajuste_valor_candidato_similaridade",
    detalhes: {
      resultadoId: resultado.id,
      itemId: resultado.item.id,
      valorRestaurado: valorOriginal,
      propagadoParaSerie: resultado.promovidoParaFonte,
    },
  });

  revalidatePath(`/processos/${resultado.item.processoId}`);

  return { data: { valorUnitario: valorOriginal } };
}
