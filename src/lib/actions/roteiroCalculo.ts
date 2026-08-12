"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import {
  FREQUENCIAS_EXECUCAO,
  PERIODICIDADES_CONTRATO,
  executarRoteiro,
  type ParametrosTR,
} from "@/lib/domain/roteiroCalculo";
import { roteiroCalculoSchema } from "@/lib/validations/roteiroCalculo";
import type { ActionResult } from "./processos";

// ---------------------------------------------------------------------------
// Parâmetros do TR (no item)
// ---------------------------------------------------------------------------

const parametrosTRSchema = z.object({
  itemId: z.string().cuid(),
  medida: z.number().finite().positive().nullable(),
  medidaUnidade: z.string().trim().max(40).nullable(),
  frequencia: z.enum(FREQUENCIAS_EXECUCAO).nullable(),
  // Teto de 120 meses: acima disso é erro de digitação, não contrato.
  vigenciaMeses: z.number().int().positive().max(120).nullable(),
});

export type EntradaParametrosTR = z.input<typeof parametrosTRSchema>;

/**
 * Grava a medida do objeto, a frequência e a vigência pretendida do item.
 *
 * Estes números entram no cálculo de TODOS os candidatos do item (passos
 * `medida_tr`, `quantidade_tr` e `execucoes_periodo`), e é justamente por isso
 * que moram aqui: um só lugar para corrigir, e nenhuma chance de dois
 * candidatos do mesmo item usarem metragens diferentes.
 */
export async function salvarParametrosTR(
  input: EntradaParametrosTR,
): Promise<ActionResult<{ itemId: string }>> {
  const user = await requireRole("pesquisa");

  const parsed = parametrosTRSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const item = await db.item.findUnique({
    where: { id: parsed.data.itemId },
    select: { id: true, processoId: true },
  });
  if (!item) return { error: "Item não encontrado" };

  await db.item.update({
    where: { id: item.id },
    data: {
      trMedida: parsed.data.medida,
      trMedidaUnidade: parsed.data.medidaUnidade?.trim() || null,
      trFrequencia: parsed.data.frequencia,
      trVigenciaMeses: parsed.data.vigenciaMeses,
    },
  });

  await registrarAuditoria({
    userId: user.id,
    processoId: item.processoId,
    acao: "salvar_parametros_tr_item",
    detalhes: {
      itemId: item.id,
      medida: parsed.data.medida,
      medidaUnidade: parsed.data.medidaUnidade,
      frequencia: parsed.data.frequencia,
      vigenciaMeses: parsed.data.vigenciaMeses,
    },
  });

  revalidatePath(`/processos/${item.processoId}`);

  return { data: { itemId: item.id } };
}

// ---------------------------------------------------------------------------
// Roteiro de cálculo (no candidato)
// ---------------------------------------------------------------------------

const salvarRoteiroSchema = z.object({
  resultadoId: z.string().cuid(),
  roteiro: roteiroCalculoSchema,
  /** Vigência do contrato de REFERÊNCIA — documental, não entra na conta. */
  periodicidade: z.enum(PERIODICIDADES_CONTRATO).nullable(),
});

export type EntradaRoteiro = z.input<typeof salvarRoteiroSchema>;

/**
 * Grava o roteiro de cálculo do candidato e o valor que ele produz.
 *
 * O roteiro é reexecutado AQUI, no servidor, com os parâmetros do item lidos do
 * banco — nunca se aceita o valor final que o cliente calculou. Um número
 * enviado pelo navegador viraria preço na estimativa sem que ninguém
 * conseguisse refazer a conta (IN 65/2021).
 *
 * Quando o candidato já foi promovido, Fonte e PrecoConsolidado são atualizados
 * na MESMA transação: divergirem entre si é estimativa injustificável.
 */
export async function salvarRoteiroCalculo(
  input: EntradaRoteiro,
): Promise<ActionResult<{ valorConsiderado: number }>> {
  const user = await requireRole("pesquisa");

  const parsed = salvarRoteiroSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  // `select` explícito e enxuto (CLAUDE.md §9.46).
  const resultado = await db.resultadoSimilaridade.findUnique({
    where: { id: parsed.data.resultadoId },
    select: {
      id: true,
      valorUnitario: true,
      promovidoParaFonte: true,
      item: {
        select: {
          id: true,
          processoId: true,
          quantidade: true,
          unidade: true,
          trMedida: true,
          trMedidaUnidade: true,
          trFrequencia: true,
          trVigenciaMeses: true,
        },
      },
    },
  });
  if (!resultado) return { error: "Candidato não encontrado" };

  const tr: ParametrosTR = {
    medida: resultado.item.trMedida === null ? null : Number(resultado.item.trMedida),
    medidaUnidade: resultado.item.trMedidaUnidade,
    quantidade: resultado.item.quantidade,
    unidade: resultado.item.unidade,
    frequencia: resultado.item.trFrequencia,
    vigenciaMeses: resultado.item.trVigenciaMeses,
  };

  const roteiro = {
    valorInicial: parsed.data.roteiro.valorInicial,
    rotuloInicial: parsed.data.roteiro.rotuloInicial ?? null,
    unidadeInicial: parsed.data.roteiro.unidadeInicial ?? null,
    passos: parsed.data.roteiro.passos.map((p) => ({
      operacao: p.operacao,
      origem: p.origem,
      valor: p.valor ?? null,
      rotulo: p.rotulo ?? null,
      unidade: p.unidade ?? null,
    })),
    justificativaComplementar: parsed.data.roteiro.justificativaComplementar ?? null,
  };

  const execucao = executarRoteiro(roteiro, tr);
  if (!execucao.ok) return { error: execucao.erro };

  await db.$transaction(async (tx) => {
    await tx.resultadoSimilaridade.update({
      where: { id: resultado.id },
      data: {
        roteiroCalculo: roteiro,
        valorConsiderado: execucao.valorFinal,
        ajustePeriodicidade: parsed.data.periodicidade,
        // Espelhos do roteiro nas colunas do M20, para a tabela e os relatórios
        // que leem colunas continuarem enxergando o mesmo número/unidade.
        valorUnitarioAjustado: execucao.valorFinal,
        ajusteUnidadeMedida: roteiro.unidadeInicial,
      },
    });

    if (resultado.promovidoParaFonte) {
      await tx.fonte.updateMany({
        where: { resultadoSimilaridadeId: resultado.id },
        data: { valorUnitario: execucao.valorFinal },
      });
      await tx.precoConsolidado.updateMany({
        where: { resultadoSimilaridadeId: resultado.id },
        data: { valorUnitario: execucao.valorFinal },
      });
    }
  });

  await registrarAuditoria({
    userId: user.id,
    processoId: resultado.item.processoId,
    acao: "salvar_roteiro_calculo_candidato",
    detalhes: {
      resultadoId: resultado.id,
      itemId: resultado.item.id,
      valorOriginalFonte: Number(resultado.valorUnitario),
      valorConsiderado: execucao.valorFinal,
      grandeza: execucao.grandeza,
      passos: roteiro.passos.length,
      roteiro,
      propagadoParaSerie: resultado.promovidoParaFonte,
    },
  });

  revalidatePath(`/processos/${resultado.item.processoId}`);

  return { data: { valorConsiderado: execucao.valorFinal } };
}

/**
 * Remove o roteiro: o candidato volta a valer pelo valor publicado pela fonte,
 * e a série (se ele já foi promovido) volta junto.
 */
export async function limparRoteiroCalculo(
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

  await db.$transaction(async (tx) => {
    await tx.resultadoSimilaridade.update({
      where: { id: resultado.id },
      data: {
        // `Prisma.DbNull` e não `null`: em coluna Json, `null` é ambíguo entre
        // "sem valor" e "o JSON literal null", e o client recusa o `null` cru.
        roteiroCalculo: Prisma.DbNull,
        valorConsiderado: null,
        valorUnitarioAjustado: null,
        // Campos do M20, mantidos nulos junto para o candidato não voltar
        // "meio ajustado" (CLAUDE.md §9.14 — estado parcial é pior que nenhum).
        ajusteValorBase: null,
        ajusteOperacao: null,
        ajusteQuantidade: null,
        ajusteUnidadeMedida: null,
        ajusteQuantidadeTR: null,
        ajusteBaseSerie: null,
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
    acao: "limpar_roteiro_calculo_candidato",
    detalhes: {
      resultadoId: resultado.id,
      itemId: resultado.item.id,
      valorRestaurado: Number(resultado.valorUnitario),
      propagadoParaSerie: resultado.promovidoParaFonte,
    },
  });

  revalidatePath(`/processos/${resultado.item.processoId}`);

  return { data: { valorUnitario: Number(resultado.valorUnitario) } };
}
