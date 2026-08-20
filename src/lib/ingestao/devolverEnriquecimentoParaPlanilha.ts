// Sem `import "server-only"` deliberadamente (CLAUDE.md §9.62): scripts/devolver-enriquecimento-planilha.ts
// precisa importar este módulo fora do bundler do Next.
import { db } from "@/lib/db";
import {
  escreverEnriquecimentoNaPlanilha,
  type ResultadoEscritaEnriquecimento,
} from "@/lib/sheets/escreverEnriquecimentoNaPlanilha";

/**
 * Ponte entre o banco (`Fornecedor`, já enriquecido pelo M26) e a planilha Google (M24, registro
 * mestre) — fecha a lacuna descrita em docs/PLAN.md M27: sem devolver o enriquecimento à planilha,
 * a próxima sincronização do M24 (que copia célula VAZIA da planilha para o banco) apagaria
 * Cidade/UF/Telefone/E-mail/Tags que o M26 preencheu via BrasilAPI.
 *
 * Fonte: todo `Fornecedor` ativo com `origemPlanilhaLinhaId` (veio da planilha, é candidato a ter
 * campo para devolver) — não filtra por "foi enriquecido recentemente" porque não há timestamp
 * dedicado para isso, e a operação já é idempotente e segura de rodar sobre TODOS: a regra "só
 * escreve célula vazia" de `escreverEnriquecimentoNaPlanilha` garante que rodar de novo sobre quem
 * já foi devolvido não escreve nada (a planilha já não está mais vazia ali).
 */
export async function devolverEnriquecimentoParaPlanilha(
  opcoes: { limite?: number; dryRun?: boolean } = {},
): Promise<ResultadoEscritaEnriquecimento> {
  const fornecedores = await db.fornecedor.findMany({
    where: { status: "ativo", origemPlanilhaLinhaId: { not: null } },
    select: {
      origemPlanilhaLinhaId: true,
      razaoSocial: true,
      cidade: true,
      estado: true,
      categoria: true,
      email: true,
      telefone: true,
    },
    take: opcoes.limite,
  });

  const candidatos = fornecedores.map((f) => ({
    origemPlanilhaLinhaId: f.origemPlanilhaLinhaId!,
    razaoSocial: f.razaoSocial,
    cidade: f.cidade,
    estado: f.estado,
    categoria: f.categoria,
    email: f.email,
    telefone: f.telefone,
  }));

  return escreverEnriquecimentoNaPlanilha(candidatos, { dryRun: opcoes.dryRun });
}
