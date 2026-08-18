"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
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
 * Executa a qualificação de um fornecedor (M19): consulta situação cadastral
 * de CNPJ, grava o resultado com a data da consulta em
 * `QualificacaoFornecedor` (histórico, nunca sobrescrito) e atualiza o espelho
 * em `Fornecedor.statusQualificacao`.
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
  if (!fornecedor.cnpj) {
    return { error: "Fornecedor sem CNPJ cadastrado — não é possível consultar situação cadastral." };
  }

  const dataConsulta = new Date();

  const resultadoCadastral = await consultarSituacaoCadastral(fornecedor.cnpj);

  const avaliacao = avaliarQualificacao({
    situacaoCadastral: resultadoCadastral.encontrado ? resultadoCadastral.situacao : null,
  });

  await db.$transaction([
    db.qualificacaoFornecedor.create({
      data: {
        fornecedorId: fornecedor.id,
        dataConsulta,
        statusQualificacao: avaliacao.value.status,
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
