"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import type { StatusProcesso } from "@prisma/client";

export interface FiltrosProcessoServer {
  busca?: string;
  status?: StatusProcesso;
  responsavel?: string;
  dataInicio?: string;
  dataFim?: string;
}

export async function listarProcessos(filtros?: FiltrosProcessoServer) {
  await requireAuth();

  return db.processo.findMany({
    where: {
      ...(filtros?.busca
        ? {
            OR: [
              { objeto: { contains: filtros.busca, mode: "insensitive" } },
              { numero: { contains: filtros.busca, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(filtros?.status ? { status: filtros.status } : {}),
      ...(filtros?.responsavel ? { responsavel: { contains: filtros.responsavel, mode: "insensitive" } } : {}),
      ...(filtros?.dataInicio || filtros?.dataFim
        ? {
            dataAbertura: {
              ...(filtros?.dataInicio ? { gte: new Date(filtros.dataInicio) } : {}),
              ...(filtros?.dataFim ? { lte: new Date(filtros.dataFim) } : {}),
            },
          }
        : {}),
    },
    include: {
      itens: { take: 1, select: { descricao: true, classificacao: true } },
    },
    orderBy: { dataAbertura: "desc" },
  });
}

export async function obterProcessoDetalhado(id: string) {
  await requireAuth();

  return db.processo.findUnique({
    where: { id },
    include: {
      itens: {
        include: {
          fontes: { include: { evidencias: true } },
          seriePrecos: { include: { precos: true } },
        },
      },
      cotacoes: {
        include: {
          fornecedor: { select: { razaoSocial: true, cnpj: true } },
          proposta: true,
        },
        orderBy: { dataEnvio: "desc" },
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { name: true, role: true } } },
      },
    },
  });
}
