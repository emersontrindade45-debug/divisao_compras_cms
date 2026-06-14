"use server";

import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { createPrecoConsolidadoSchema } from "@/lib/validations/preco";
import {
  calcularEstatisticas,
  excluirDiscrepantes,
  validarEvidenciasFontes,
} from "@/lib/domain/priceStats";
import { validarValidadeFontes } from "@/lib/domain/in65Rules";
import { z } from "zod";
import type { ActionResult } from "./processos";

const createSeriePrecoSchema = z.object({
  itemId: z.string().cuid(),
  metodo: z.enum(["media", "mediana", "menor_valor"]),
});

export async function criarSeriePreco(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createSeriePrecoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const item = await db.item.findUnique({ where: { id: parsed.data.itemId } });
  if (!item) return { error: "Item não encontrado" };

  const existing = await db.seriePreco.findFirst({ where: { itemId: parsed.data.itemId } });
  if (existing) return { error: "Já existe uma série de preços para este item" };

  const serie = await db.seriePreco.create({
    data: {
      itemId: parsed.data.itemId,
      metodo: parsed.data.metodo,
      valorEstimado: 0,
      media: 0,
      mediana: 0,
      menorValor: 0,
      coeficienteVariacao: 0,
      totalPrecos: 0,
      precosIncluidos: 0,
    },
  });

  await registrarAuditoria({
    userId: user.id,
    processoId: item.processoId,
    acao: "criar_serie_preco",
    detalhes: { serieId: serie.id, itemId: parsed.data.itemId },
  });

  return { data: { id: serie.id } };
}

export async function adicionarPreco(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createPrecoConsolidadoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const serie = await db.seriePreco.findUnique({
    where: { id: parsed.data.seriePrecoId },
    include: { item: { select: { processoId: true } } },
  });
  if (!serie) return { error: "Série de preços não encontrada" };

  const preco = await db.precoConsolidado.create({ data: parsed.data });

  await registrarAuditoria({
    userId: user.id,
    processoId: serie.item.processoId,
    acao: "adicionar_preco",
    detalhes: { precoId: preco.id, serieId: parsed.data.seriePrecoId },
  });

  return { data: { id: preco.id } };
}

export async function consolidarSeriePreco(
  serieId: string,
  tipoObjeto: "aquisicao" | "obra",
): Promise<
  ActionResult<{
    valorEstimado: number;
    violations: Array<{ code: string; rule: string; severity: string }>;
  }>
> {
  const user = await requireRole("pesquisa");

  const serie = await db.seriePreco.findUnique({
    where: { id: serieId },
    include: {
      precos: { where: { status: "incluido" } },
      item: {
        include: {
          fontes: { include: { evidencias: true } },
        },
      },
    },
  });

  if (!serie) return { error: "Série não encontrada" };

  // Validate evidences for all fontes
  const fontesComEvidencias = serie.item.fontes.map((f) => ({
    id: f.id,
    evidencias: f.evidencias.map((e) => ({ dataHoraAcesso: e.dataHoraAcesso })),
  }));
  const evidResult = validarEvidenciasFontes(fontesComEvidencias);
  if (!evidResult.valid) {
    return {
      error:
        evidResult.violations.find((v) => v.severity === "block")?.rule ??
        "Evidências inválidas",
    };
  }

  // Validate source validity dates
  const today = new Date();
  const fontesParaValidar = serie.item.fontes.map((f) => ({
    fonteId: f.id,
    tipo: f.tipo as "contratacao_publica" | "site_eletronico" | "fornecedor_direto",
    dataReferencia: f.dataReferencia,
  }));
  const validadeResult = validarValidadeFontes(fontesParaValidar, today);
  if (!validadeResult.valid) {
    return {
      error:
        validadeResult.violations.find((v) => v.severity === "block")?.rule ??
        "Fontes expiradas",
    };
  }

  // Compute statistics
  const valores = serie.precos.map((p) => Number(p.valorUnitario));
  const { incluidos, excluidos } = excluirDiscrepantes(valores, tipoObjeto);
  const metodo = serie.metodo as "media" | "mediana" | "menor_valor";
  const estatResult = calcularEstatisticas(incluidos, metodo);

  if (!estatResult.valid) {
    return {
      error:
        estatResult.violations.find((v) => v.severity === "block")?.rule ??
        "Estatísticas inválidas",
    };
  }

  const { media, mediana, menorValor, coeficienteVariacao, valorEstimado } = estatResult.value;

  await db.seriePreco.update({
    where: { id: serieId },
    data: {
      valorEstimado,
      media,
      mediana,
      menorValor,
      coeficienteVariacao,
      totalPrecos: valores.length,
      precosIncluidos: incluidos.length,
    },
  });

  // Mark excluded prices
  if (excluidos.length > 0) {
    const allPrecos = serie.precos.filter((p) => excluidos.includes(Number(p.valorUnitario)));
    for (const preco of allPrecos) {
      await db.precoConsolidado.update({
        where: { id: preco.id },
        data: { status: "excluido", motivoExclusao: "Excluído por dispersão estatística" },
      });
    }
  }

  await registrarAuditoria({
    userId: user.id,
    processoId: serie.item.processoId,
    acao: "consolidar_serie_preco",
    detalhes: {
      serieId,
      valorEstimado,
      cv: coeficienteVariacao,
      precosIncluidos: incluidos.length,
      precosExcluidos: excluidos.length,
    },
  });

  return {
    data: {
      valorEstimado,
      violations: estatResult.violations,
    },
  };
}

export async function obterSeriePreco(serieId: string) {
  await requireAuth();
  return db.seriePreco.findUnique({
    where: { id: serieId },
    include: { precos: { orderBy: { dataReferencia: "asc" } } },
  });
}

export async function obterSeriePorItem(itemId: string) {
  await requireAuth();
  return db.seriePreco.findFirst({
    where: { itemId },
    include: { precos: { orderBy: { dataReferencia: "asc" } } },
  });
}
