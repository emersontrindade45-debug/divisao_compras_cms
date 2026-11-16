"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { alterarSenhaSchema } from "@/lib/validations/auth";

export interface AlterarSenhaState {
  error?: string;
  ok?: boolean;
}

/**
 * Troca a senha do próprio usuário logado. Exige a senha atual: a sessão dura 7 dias, e sem essa
 * conferência quem pegasse um computador com a sessão aberta tomaria a conta.
 *
 * O id vem da sessão, nunca do formulário, então ninguém troca a senha de outra pessoa por aqui.
 */
export async function alterarSenha(
  _prev: AlterarSenhaState,
  formData: FormData,
): Promise<AlterarSenhaState> {
  const user = await requireAuth();

  const parsed = alterarSenhaSchema.safeParse({
    senhaAtual: formData.get("senhaAtual"),
    novaSenha: formData.get("novaSenha"),
    confirmacao: formData.get("confirmacao"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const { senhaAtual, novaSenha } = parsed.data;

  // `select` explícito: só o hash interessa, e a consulta não quebra se o model ganhar coluna (§9.46).
  const atual = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!atual) return { error: "Usuário não encontrado. Saia e entre de novo." };

  const confere = await bcrypt.compare(senhaAtual, atual.passwordHash);
  if (!confere) return { error: "Senha atual incorreta" };

  const passwordHash = await bcrypt.hash(novaSenha, 10);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });

  // Nada da senha vai para a auditoria, nem o hash.
  await registrarAuditoria({ userId: user.id, acao: "senha_alterada" });

  return { ok: true };
}
