"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { z } from "zod";
import { storageAdapter } from "@/lib/storage";
import type { ActionResult } from "./processos";

const createFonteSchema = z.object({
  itemId: z.string().cuid(),
  tipo: z.enum(["contratacao_publica", "site_eletronico", "fornecedor_direto"]),
  descricao: z.string().min(1, "Descrição obrigatória"),
  orgaoOuFornecedor: z.string().min(1, "Órgão ou fornecedor obrigatório"),
  dataReferencia: z.coerce.date(),
  valorUnitario: z.number().positive("Valor unitário deve ser positivo"),
  motivoExclusao: z.string().optional(),
});

const createEvidenciaSchema = z.object({
  fonteId: z.string().cuid(),
  dataHoraAcesso: z.coerce.date(),
  url: z.string().url().optional(),
  descricao: z.string().optional(),
});

export async function criarFonte(
  input: z.infer<typeof createFonteSchema>,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createFonteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const item = await db.item.findUnique({ where: { id: parsed.data.itemId } });
  if (!item) return { error: "Item não encontrado" };

  const fonte = await db.fonte.create({ data: parsed.data });

  await registrarAuditoria({
    userId: user.id,
    processoId: item.processoId,
    acao: "criar_fonte",
    detalhes: { fonteId: fonte.id, tipo: parsed.data.tipo },
  });

  return { data: { id: fonte.id } };
}

export async function criarEvidencia(
  input: z.infer<typeof createEvidenciaSchema>,
  arquivo?: File,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createEvidenciaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const fonte = await db.fonte.findUnique({
    where: { id: parsed.data.fonteId },
    include: { item: { select: { processoId: true } } },
  });
  if (!fonte) return { error: "Fonte não encontrada" };

  let arquivoUrl: string | undefined;
  if (arquivo) {
    const uploaded = await storageAdapter.upload(arquivo, "evidencias");
    arquivoUrl = uploaded.url;
  }

  const evidencia = await db.evidencia.create({
    data: {
      fonteId: parsed.data.fonteId,
      dataHoraAcesso: parsed.data.dataHoraAcesso,
      url: parsed.data.url ?? arquivoUrl,
      arquivo: arquivoUrl,
      descricao: parsed.data.descricao,
    },
  });

  await registrarAuditoria({
    userId: user.id,
    processoId: fonte.item.processoId,
    acao: "criar_evidencia",
    detalhes: { evidenciaId: evidencia.id, fonteId: parsed.data.fonteId },
  });

  return { data: { id: evidencia.id } };
}

export async function listarFontesPorItem(itemId: string) {
  await requireAuth();
  return db.fonte.findMany({
    where: { itemId },
    include: { evidencias: true },
    orderBy: { createdAt: "asc" },
  });
}

const createFonteManualSchema = z.object({
  itemId: z.string().cuid(),
  tipo: z.enum(["contratacao_publica", "site_eletronico", "fornecedor_direto"]),
  descricao: z.string().min(1, "Descrição obrigatória"),
  orgaoOuFornecedor: z.string().min(1, "Órgão ou fornecedor obrigatório"),
  dataReferencia: z.coerce.date(),
  valorUnitario: z.number().positive("Valor unitário deve ser positivo"),
  dataHoraAcesso: z.coerce.date(),
  url: z.string().url().optional(),
  descricaoEvidencia: z.string().optional(),
});

/**
 * Cadastro retroativo de fonte, para pesquisa feita fora do sistema (por
 * fornecedor/site/contratação já identificados na época, nunca digitados
 * aqui). Espelha em uma única transação o que `promoverFonte.ts` faz ao
 * promover um candidato de similaridade — Fonte + Evidência + SeriePreco (se
 * não existir) + PrecoConsolidado — porque uma Fonte sem `PrecoConsolidado`
 * correspondente fica invisível na série de preços e na consolidação (OP-ADH-04),
 * mesmo satisfazendo o alerta de "fonte pública" do dashboard.
 *
 * Evidência com URL ou arquivo é exigida na própria chamada (não em duas
 * etapas): nenhum preço entra sem fonte+data+evidência (CLAUDE.md §1).
 */
export async function criarFonteManual(
  input: z.infer<typeof createFonteManualSchema>,
  arquivo?: File,
): Promise<ActionResult<{ fonteId: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createFonteManualSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  if (!parsed.data.url && !arquivo) {
    return { error: "Informe a URL da evidência ou anexe um arquivo" };
  }

  const item = await db.item.findUnique({
    where: { id: parsed.data.itemId },
    select: { id: true, processoId: true },
  });
  if (!item) return { error: "Item não encontrado" };

  let arquivoUrl: string | undefined;
  if (arquivo) {
    const uploaded = await storageAdapter.upload(arquivo, "evidencias");
    arquivoUrl = uploaded.url;
  }

  const fonteId = await db.$transaction(async (tx) => {
    const fonte = await tx.fonte.create({
      data: {
        itemId: parsed.data.itemId,
        tipo: parsed.data.tipo,
        descricao: parsed.data.descricao,
        orgaoOuFornecedor: parsed.data.orgaoOuFornecedor,
        dataReferencia: parsed.data.dataReferencia,
        valorUnitario: parsed.data.valorUnitario,
      },
    });

    await tx.evidencia.create({
      data: {
        fonteId: fonte.id,
        dataHoraAcesso: parsed.data.dataHoraAcesso,
        url: parsed.data.url ?? arquivoUrl,
        arquivo: arquivoUrl,
        descricao: parsed.data.descricaoEvidencia,
      },
    });

    let serie = await tx.seriePreco.findFirst({ where: { itemId: parsed.data.itemId } });
    if (!serie) {
      serie = await tx.seriePreco.create({
        data: {
          itemId: parsed.data.itemId,
          metodo: "media",
          valorEstimado: 0,
          media: 0,
          mediana: 0,
          menorValor: 0,
          coeficienteVariacao: 0,
          totalPrecos: 0,
          precosIncluidos: 0,
        },
      });
    }

    await tx.precoConsolidado.create({
      data: {
        seriePrecoId: serie.id,
        fonte: parsed.data.tipo,
        descricaoFonte: parsed.data.descricao,
        fornecedorOuOrgao: parsed.data.orgaoOuFornecedor,
        dataReferencia: parsed.data.dataReferencia,
        valorUnitario: parsed.data.valorUnitario,
      },
    });

    return fonte.id;
  });

  await registrarAuditoria({
    userId: user.id,
    processoId: item.processoId,
    acao: "criar_fonte_manual",
    detalhes: { fonteId, itemId: parsed.data.itemId, tipo: parsed.data.tipo },
  });

  revalidatePath(`/processos/${item.processoId}`);
  revalidatePath("/processos");
  revalidatePath("/dashboard");

  return { data: { fonteId } };
}

export async function excluirFonte(fonteId: string): Promise<ActionResult> {
  const user = await requireRole("revisao");
  const fonte = await db.fonte.findUnique({
    where: { id: fonteId },
    include: { item: { select: { processoId: true } } },
  });
  if (!fonte) return { error: "Fonte não encontrada" };

  await db.fonte.delete({ where: { id: fonteId } });

  await registrarAuditoria({
    userId: user.id,
    processoId: fonte.item.processoId,
    acao: "excluir_fonte",
    detalhes: { fonteId },
  });

  return {};
}
