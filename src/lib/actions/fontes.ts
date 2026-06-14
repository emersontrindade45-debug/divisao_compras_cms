"use server";

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
