"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { consultarSancoesCnpj } from "@/lib/integracoes/portalTransparencia";
import { consultarSituacaoCadastral } from "@/lib/integracoes/situacaoCadastralCnpj";
import { avaliarQualificacao } from "@/lib/domain/qualificacaoFornecedor";
import type { ActionResult } from "./processos";

export interface QualificarFornecedorResultado {
  status: "regular" | "sancionado" | "cadastro_irregular" | "nao_verificado";
  alerta: boolean;
  mensagem: string;
  dataConsulta: string;
}

/**
 * Executa a qualificação de um fornecedor (M19): consulta CEIS/CNEP (sanções)
 * e situação cadastral de CNPJ, grava o resultado com a data da consulta em
 * `QualificacaoFornecedor` (histórico, nunca sobrescrito) e atualiza o espelho
 * em `Fornecedor.statusQualificacao`.
 *
 * Guarda de token é fail-closed dentro de `consultarSancoesCnpj` (CLAUDE.md
 * §9.45): sem `PORTAL_TRANSPARENCIA_TOKEN`, a consulta de sanções volta
 * `negada: true` e o status final cai em `nao_verificado` — nunca "regular".
 */
export async function qualificarFornecedor(
  fornecedorId: string,
): Promise<ActionResult<QualificarFornecedorResultado>> {
  const user = await requireRole("pesquisa");

  const fornecedor = await db.fornecedor.findUnique({
    where: { id: fornecedorId },
    select: { id: true, cnpj: true, razaoSocial: true },
  });
  if (!fornecedor) return { error: "Fornecedor não encontrado." };

  const dataConsulta = new Date();

  const [resultadoSancoes, resultadoCadastral] = await Promise.all([
    consultarSancoesCnpj(fornecedor.cnpj),
    consultarSituacaoCadastral(fornecedor.cnpj),
  ]);

  const avaliacao = avaliarQualificacao({
    consultaSancoesNegada: resultadoSancoes.negada,
    motivoNegacaoSancoes: resultadoSancoes.negada ? resultadoSancoes.motivo : undefined,
    sancoesEncontradas: resultadoSancoes.negada ? [] : resultadoSancoes.sancoes,
    situacaoCadastral: resultadoCadastral.encontrado ? resultadoCadastral.situacao : null,
  });

  await db.$transaction([
    db.qualificacaoFornecedor.create({
      data: {
        fornecedorId: fornecedor.id,
        dataConsulta,
        statusQualificacao: avaliacao.value.status,
        consultaNegada: resultadoSancoes.negada,
        motivoNegacao: resultadoSancoes.negada ? resultadoSancoes.motivo : null,
        sancoesEncontradas: resultadoSancoes.negada
          ? undefined
          : (resultadoSancoes.sancoes as unknown as Prisma.InputJsonValue),
        situacaoCadastral: resultadoCadastral.encontrado ? resultadoCadastral.situacao : null,
      },
    }),
    db.fornecedor.update({
      where: { id: fornecedor.id },
      data: { statusQualificacao: avaliacao.value.status },
    }),
  ]);

  await registrarAuditoria({
    userId: user.id,
    acao: "qualificar_fornecedor",
    detalhes: {
      fornecedorId: fornecedor.id,
      status: avaliacao.value.status,
      alerta: avaliacao.value.alerta,
      consultaSancoesNegada: resultadoSancoes.negada,
    },
  });

  revalidatePath("/fornecedores");
  revalidatePath(`/fornecedores/${fornecedorId}`);

  return {
    data: {
      status: avaliacao.value.status,
      alerta: avaliacao.value.alerta,
      mensagem: avaliacao.value.mensagem,
      dataConsulta: dataConsulta.toISOString(),
    },
  };
}
