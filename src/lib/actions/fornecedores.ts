"use server";

import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { createFornecedorSchema, updateFornecedorSchema } from "@/lib/validations/fornecedor";
import { calcularScore } from "@/lib/domain/supplierScore";
import type { ActionResult } from "./processos";

export async function criarFornecedor(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createFornecedorSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const existente = await db.fornecedor.findUnique({ where: { cnpj: parsed.data.cnpj } });
  if (existente) return { error: "CNPJ já cadastrado" };

  const fornecedor = await db.fornecedor.create({ data: parsed.data });

  await registrarAuditoria({
    userId: user.id,
    acao: "criar_fornecedor",
    detalhes: { fornecedorId: fornecedor.id, cnpj: parsed.data.cnpj },
  });

  return { data: { id: fornecedor.id } };
}

export async function atualizarFornecedor(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireRole("pesquisa");
  const parsed = updateFornecedorSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const fornecedor = await db.fornecedor.findUnique({ where: { id } });
  if (!fornecedor) return { error: "Fornecedor não encontrado" };

  await db.fornecedor.update({ where: { id }, data: parsed.data });

  await registrarAuditoria({
    userId: user.id,
    acao: "atualizar_fornecedor",
    detalhes: { fornecedorId: id },
  });

  return {};
}

export async function listarFornecedores(filtros?: {
  busca?: string;
  cidade?: string;
  categoria?: string;
}) {
  await requireAuth();

  return db.fornecedor.findMany({
    where: {
      ...(filtros?.busca
        ? {
            OR: [
              { razaoSocial: { contains: filtros.busca, mode: "insensitive" } },
              { cnpj: { contains: filtros.busca } },
            ],
          }
        : {}),
      ...(filtros?.cidade ? { cidade: { contains: filtros.cidade, mode: "insensitive" } } : {}),
      ...(filtros?.categoria ? { categoria: { has: filtros.categoria } } : {}),
    },
    orderBy: { razaoSocial: "asc" },
  });
}

export async function obterScoreFornecedor(fornecedorId: string) {
  await requireAuth();

  const fornecedor = await db.fornecedor.findUnique({
    where: { id: fornecedorId },
    select: {
      totalCotacoes: true,
      totalRespostas: true,
      historicoCotacoes: {
        select: { data: true, statusResposta: true },
        orderBy: { data: "asc" },
      },
    },
  });

  if (!fornecedor) return null;

  return calcularScore({
    totalCotacoes: fornecedor.totalCotacoes,
    totalRespostas: fornecedor.totalRespostas,
    historicoRespostas: fornecedor.historicoCotacoes.map((h) => ({
      dataEnvio: h.data,
      dataResposta: h.statusResposta === "respondido" ? h.data : undefined,
    })),
  });
}
