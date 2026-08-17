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
    // select explícito: §9.46 — coluna nova (trContexto) não pode ser buscada
    // antes da migration ser aplicada em produção.
    select: {
      id: true,
      numero: true,
      objeto: true,
      unidade: true,
      quantidade: true,
      caracteristicasTecnicas: true,
      palavrasChave: true,
      classificacao: true,
      responsavel: true,
      status: true,
      faseAndamento: true,
      dataAbertura: true,
      planilhaOrigemUrl: true,
      createdAt: true,
      updatedAt: true,
      itens: { take: 1, select: { descricao: true, classificacao: true } },
    },
    orderBy: { dataAbertura: "desc" },
  });
}

export async function listarProcessosComSerie() {
  await requireAuth();

  return db.processo.findMany({
    // select explícito: §9.46
    select: {
      id: true,
      numero: true,
      objeto: true,
      unidade: true,
      quantidade: true,
      caracteristicasTecnicas: true,
      palavrasChave: true,
      classificacao: true,
      responsavel: true,
      status: true,
      dataAbertura: true,
      planilhaOrigemUrl: true,
      createdAt: true,
      updatedAt: true,
      itens: {
        take: 1,
        select: {
          id: true,
          descricao: true,
          unidade: true,
          quantidade: true,
          classificacao: true,
          caracteristicasTecnicas: true,
          palavrasChave: true,
          createdAt: true,
          updatedAt: true,
          processoId: true,
          seriePrecos: {
            take: 1,
            orderBy: { createdAt: "desc" as const },
            select: {
              id: true,
              itemId: true,
              metodo: true,
              valorEstimado: true,
              media: true,
              mediana: true,
              menorValor: true,
              coeficienteVariacao: true,
              totalPrecos: true,
              precosIncluidos: true,
              createdAt: true,
              updatedAt: true,
              precos: { orderBy: { dataReferencia: "asc" as const } },
            },
          },
        },
      },
    },
    orderBy: { dataAbertura: "desc" },
  });
}

export async function obterFontesSimilaridade(processoId: string) {
  await requireAuth();

  return db.item.findMany({
    where: { processoId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      descricao: true,
      unidade: true,
      quantidade: true,
      natureza: true,
      trMedida: true,
      trMedidaUnidade: true,
      trFrequencia: true,
      trVigenciaMeses: true,
      resultadosSimilaridade: {
        where: { descartado: false },
        orderBy: { scoreFinal: "desc" },
        // Até 10 contratos por item: a IN 65/2021 não fixa um teto, e cortar a
        // lista abaixo do que o analista reuniu esconde preço já pesquisado.
        take: 10,
        select: {
          id: true,
          tipoCandidato: true,
          fonteDescricao: true,
          fonteOrgaoOuId: true,
          fonteUrl: true,
          valorUnitario: true,
          dataReferencia: true,
          scoreFinal: true,
          justificativa: true,
          promovidoParaFonte: true,
          competenciaReferencia: true,
          regimeReferencia: true,
          localidadeReferencia: true,
          ajusteValorBase: true,
          ajusteOperacao: true,
          ajusteQuantidade: true,
          ajusteUnidadeMedida: true,
          ajusteQuantidadeTR: true,
          ajustePeriodicidade: true,
          valorUnitarioAjustado: true,
          ajusteBaseSerie: true,
          valorConsiderado: true,
          roteiroCalculo: true,
        },
      },
    },
  });
}

export async function obterProcessoDetalhado(id: string) {
  await requireAuth();

  return db.processo.findUnique({
    where: { id },
    // select explícito: §9.46
    select: {
      id: true,
      numero: true,
      objeto: true,
      unidade: true,
      quantidade: true,
      caracteristicasTecnicas: true,
      palavrasChave: true,
      classificacao: true,
      responsavel: true,
      status: true,
      faseAndamento: true,
      dataAbertura: true,
      planilhaOrigemUrl: true,
      createdAt: true,
      updatedAt: true,
      itens: {
        select: {
          id: true,
          descricao: true,
          unidade: true,
          quantidade: true,
          classificacao: true,
          natureza: true,
          caracteristicasTecnicas: true,
          palavrasChave: true,
          processoId: true,
          createdAt: true,
          updatedAt: true,
          fontes: { include: { evidencias: true } },
          seriePrecos: { include: { precos: { orderBy: { dataReferencia: "asc" } } } },
        },
      },
      capturas: {
        include: { site: { select: { nome: true, lista: true } } },
        orderBy: { dataHoraAcesso: "desc" },
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
