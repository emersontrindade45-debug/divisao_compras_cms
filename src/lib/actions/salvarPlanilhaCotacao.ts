"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import type { ActionResult } from "./processos";

export interface SalvarPlanilhaCotacaoResultado {
  planilhaCotacaoUrl: string;
}

export async function salvarPlanilhaCotacao(
  processoId: string,
  url: string,
): Promise<ActionResult<SalvarPlanilhaCotacaoResultado>> {
  const user = await requireAuth();

  if (!url || !url.trim()) {
    return { error: "Informe o link da planilha de cotação." };
  }

  const urlTrimmed = url.trim();

  const processo = await db.processo.findUnique({ where: { id: processoId } });
  if (!processo) {
    return { error: "Processo não encontrado." };
  }

  try {
    await db.processo.update({
      where: { id: processoId },
      data: { planilhaCotacaoUrl: urlTrimmed },
    });

    await registrarAuditoria({
      userId: user.id,
      processoId,
      acao: "salvar_planilha_cotacao",
      detalhes: { url: urlTrimmed },
    });
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Erro ao salvar a planilha de cotação: ${err.message}`
          : "Erro ao salvar a planilha de cotação.",
    };
  }

  revalidatePath(`/processos/${processoId}`);

  return { data: { planilhaCotacaoUrl: urlTrimmed } };
}
