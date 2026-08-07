"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";

const MAX_LOTES = 100;

/**
 * Lista as rodadas de ingestão (`LoteIngestao`) mais recentes, com a fonte de
 * referência de origem — alimenta a página de status de ingestões (M15).
 * Nenhuma fonte real roda ainda; a lista fica vazia até M16+ passar a chamar
 * `executarIngestao` (`src/lib/ingestao/runner.ts`).
 */
export async function listarLotesIngestao() {
  await requireAuth();

  return db.loteIngestao.findMany({
    orderBy: { iniciadoEm: "desc" },
    take: MAX_LOTES,
    select: {
      id: true,
      competencia: true,
      urlArquivo: true,
      linhasLidas: true,
      linhasImportadas: true,
      linhasRejeitadas: true,
      iniciadoEm: true,
      concluidoEm: true,
      erro: true,
      fonteReferencia: { select: { chave: true, nome: true } },
    },
  });
}

/** Catálogo de fontes de referência cadastradas — mesma página de status. */
export async function listarFontesReferencia() {
  await requireAuth();

  return db.fonteReferencia.findMany({
    orderBy: { nome: "asc" },
    select: {
      id: true,
      chave: true,
      nome: true,
      esfera: true,
      periodicidade: true,
      ativa: true,
      urlOficial: true,
    },
  });
}
