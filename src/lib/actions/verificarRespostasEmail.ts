"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/rbac";
import { executarVerificacao, janelaSchema, type JanelaLeitura, type ResumoLeitura } from "@/lib/emailCotacao/verificar";
import type { ActionResult } from "./processos";

// Arquivo "use server" só exporta funções assíncronas. NÃO reexportar tipos daqui (`export type { … }`):
// o Turbopack os trata como valores e o módulo estoura com "ReferenceError: <Tipo> is not defined" ao
// carregar, derrubando toda Server Action do mesmo pacote (visto em produção em 2026-11-23). Quem
// precisa dos tipos importa de "@/lib/emailCotacao/verificar".

/**
 * Botão "Verificar respostas" (M30.d): exige login, valida a entrada e delega ao miolo compartilhado
 * com a execução automática (`lib/emailCotacao/verificar.ts`), que concentra o sigilo e a auditoria.
 */
export async function verificarRespostasEmail(
  processoId?: string,
  janela?: JanelaLeitura,
): Promise<ActionResult<ResumoLeitura>> {
  // Marca o início ANTES de qualquer espera: a IA usa só o que sobrar dos 60 s da função.
  const inicioEm = Date.now();
  const user = await requireRole("pesquisa");

  const idValido = processoId === undefined || z.string().cuid().safeParse(processoId).success;
  if (!idValido) return { error: "Processo inválido." };

  if (janela !== undefined && !janelaSchema.safeParse(janela).success) {
    return { error: "Janela de leitura inválida." };
  }

  return executarVerificacao({ userId: user.id, processoId, janela, inicioEm });
}
