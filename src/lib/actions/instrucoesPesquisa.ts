"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { chaveInstrucao, LIMITE_CARACTERES_INSTRUCAO } from "@/lib/assistente/instrucoes";
import type { ActionResult } from "./processos";

// Instruções de pesquisa (M13): as regras que os servidores escrevem para o
// assistente melhorar as buscas de similaridade ao longo do tempo.
//
// Escrita exige `requireRole("revisao")` porque o texto entra no prompt de TODA
// busca e de TODO ranking do assistente: quem edita aqui altera o critério de
// similaridade de todos os processos, o que é decisão de revisão, não de
// operação. Leitura segue com `requireAuth`.

const salvarSchema = z
  .object({
    escopo: z.enum(["global", "categoria", "processo"]),
    categoria: z.string().trim().min(1).max(80).optional(),
    processoId: z.string().cuid().optional(),
    conteudo: z.string().trim().max(LIMITE_CARACTERES_INSTRUCAO),
    ativo: z.boolean().default(true),
  })
  // O escopo determina qual alvo é obrigatório; sem isso, uma instrução de
  // categoria sem categoria explodiria só lá dentro, em `chaveInstrucao`.
  .refine((v) => v.escopo !== "categoria" || Boolean(v.categoria), {
    message: "Instrução de categoria exige o nome da categoria.",
    path: ["categoria"],
  })
  .refine((v) => v.escopo !== "processo" || Boolean(v.processoId), {
    message: "Instrução de processo exige o processo.",
    path: ["processoId"],
  });

export type SalvarInstrucaoInput = z.input<typeof salvarSchema>;

export async function listarInstrucoes() {
  await requireAuth();

  return db.instrucaoPesquisa.findMany({
    orderBy: [{ escopo: "asc" }, { categoria: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      escopo: true,
      categoria: true,
      processoId: true,
      chave: true,
      conteudo: true,
      versao: true,
      ativo: true,
      updatedAt: true,
      atualizadoPor: { select: { name: true } },
      processo: { select: { numero: true } },
    },
  });
}

/**
 * Cria ou atualiza a instrução daquele escopo/alvo.
 *
 * `upsert` sobre `chave`, e não busca-depois-grava: a chave é `@unique` no
 * banco, então duas requisições simultâneas não conseguem criar dois registros
 * globais — a segunda cai no update (CLAUDE.md §9.14). O campo textual existe
 * justamente porque `@@unique([escopo, categoria, processoId])` não protegeria:
 * no Postgres NULL é distinto de NULL e dois registros globais passariam.
 */
export async function salvarInstrucao(
  input: SalvarInstrucaoInput,
): Promise<ActionResult<{ id: string; versao: number }>> {
  const user = await requireRole("revisao");

  const parsed = salvarSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const dados = parsed.data;

  let chave: string;
  try {
    chave = chaveInstrucao(dados.escopo, {
      categoria: dados.categoria,
      processoId: dados.processoId,
    });
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Escopo inválido" };
  }

  const instrucao = await db.instrucaoPesquisa.upsert({
    where: { chave },
    create: {
      escopo: dados.escopo,
      categoria: dados.categoria ?? null,
      processoId: dados.processoId ?? null,
      chave,
      conteudo: dados.conteudo,
      ativo: dados.ativo,
      atualizadoPorId: user.id,
    },
    update: {
      conteudo: dados.conteudo,
      ativo: dados.ativo,
      // Versão serve de trilha: quantas vezes esta regra já foi reescrita.
      versao: { increment: 1 },
      atualizadoPorId: user.id,
    },
    select: { id: true, versao: true },
  });

  await registrarAuditoria({
    userId: user.id,
    ...(dados.processoId ? { processoId: dados.processoId } : {}),
    acao: "salvar_instrucao_pesquisa",
    detalhes: {
      chave,
      versao: instrucao.versao,
      ativo: dados.ativo,
      caracteres: dados.conteudo.length,
    },
  });

  revalidatePath("/assistente/instrucoes");
  if (dados.processoId) revalidatePath(`/processos/${dados.processoId}`);

  return { data: instrucao };
}

/**
 * Desativa uma instrução em vez de apagá-la.
 *
 * Uma instrução já influenciou buscas e rankings anteriores; apagar o texto
 * deixaria o histórico sem como explicar por que um candidato foi pontuado como
 * foi. `ativo: false` tira do prompt e mantém o registro.
 */
export async function desativarInstrucao(id: string): Promise<ActionResult> {
  const user = await requireRole("revisao");

  const parsed = z.string().cuid().safeParse(id);
  if (!parsed.success) return { error: "Instrução inválida" };

  const atualizadas = await db.instrucaoPesquisa.updateMany({
    where: { id: parsed.data, ativo: true },
    data: { ativo: false, atualizadoPorId: user.id },
  });
  if (atualizadas.count === 0) return { error: "Instrução não encontrada ou já desativada" };

  await registrarAuditoria({
    userId: user.id,
    acao: "desativar_instrucao_pesquisa",
    detalhes: { instrucaoId: parsed.data },
  });

  revalidatePath("/assistente/instrucoes");
  return {};
}
