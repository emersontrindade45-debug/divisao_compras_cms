"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import type { ActionResult } from "./processos";

const createCapturaSchema = z.object({
  siteId: z.string().cuid(),
  processoId: z.string().cuid(),
  url: z.string().url("URL inválida"),
  produto: z.string().min(1, "Produto obrigatório"),
  valorUnitario: z.number().positive("Valor unitário deve ser positivo"),
  dataHoraAcesso: z.coerce.date(),
  evidencia: z.string().optional(),
});

export async function listarSites() {
  await requireAuth();
  return db.site.findMany({ orderBy: [{ lista: "asc" }, { nome: "asc" }] });
}

export async function listarCapturas(filtros?: { processoId?: string }) {
  await requireAuth();
  return db.capturaEvidencia.findMany({
    where: filtros?.processoId ? { processoId: filtros.processoId } : {},
    include: {
      site: { select: { nome: true, lista: true, isMarketplace: true } },
      processo: { select: { numero: true, objeto: true } },
    },
    orderBy: { dataHoraAcesso: "desc" },
  });
}

export async function criarCaptura(
  input: z.infer<typeof createCapturaSchema>,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createCapturaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const site = await db.site.findUnique({ where: { id: parsed.data.siteId } });
  if (!site) return { error: "Site não encontrado" };
  if (site.isMarketplace || site.lista === "vermelha") {
    return {
      error:
        "Site bloqueado (lista vermelha/marketplace): não pode ser usado como fonte na pesquisa de preços (IN 65/2021).",
    };
  }

  const processo = await db.processo.findUnique({
    where: { id: parsed.data.processoId },
    select: { id: true },
  });
  if (!processo) return { error: "Processo não encontrado" };

  const captura = await db.capturaEvidencia.create({ data: parsed.data });

  await registrarAuditoria({
    userId: user.id,
    processoId: parsed.data.processoId,
    acao: "criar_captura_site",
    detalhes: { capturaId: captura.id, siteId: parsed.data.siteId, url: parsed.data.url },
  });

  revalidatePath("/sites");
  revalidatePath(`/processos/${parsed.data.processoId}`);

  return { data: { id: captura.id } };
}
