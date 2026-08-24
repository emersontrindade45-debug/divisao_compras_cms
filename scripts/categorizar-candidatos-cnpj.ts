import * as dotenv from "dotenv";

dotenv.config();

import { categorizarCandidatosCnae } from "../src/lib/ingestao/categorizarCandidatosCnae";

/**
 * Categorização administrativa manual dos candidatos CNPJ/SP importados (M27, etapa 4): calcula,
 * uma vez por código CNAE distinto ainda sem entrada em `CategoriaSugeridaPorCnae`, quais
 * categorias de `Fornecedor` combinam com a descrição daquele CNAE (via IA — mesmo filtro
 * anti-alucinação do M25) e aplica o resultado em `EmpresaCandidataFornecedor.categoriaSugerida`
 * para quem ainda está vazio. Uso:
 *
 *   npx tsx scripts/categorizar-candidatos-cnpj.ts --dry-run              (não grava, só reporta)
 *   npx tsx scripts/categorizar-candidatos-cnpj.ts --dry-run --limite=20  (amostra local)
 *   npx tsx scripts/categorizar-candidatos-cnpj.ts                       (grava de verdade)
 *   npx tsx scripts/categorizar-candidatos-cnpj.ts --concorrencia=1      (mais lento, menos risco de rate limit)
 *
 * **Um banco só** (M27 — CLAUDE.md §9.82), desde 2026-08-24: a tag vem do próprio CNAE (via
 * `gerarTagCnae`, sem lista pré-cadastrada), então só o banco de CANDIDATOS é usado — leitura e
 * escrita via `DATABASE_CANDIDATOS_ADMIN_URL` (credencial de escrita, só na máquina do operador —
 * a da Vercel, `DATABASE_CANDIDATOS_URL`, tem apenas `SELECT`). Antes desta data o script também
 * lia `Fornecedor.categoria` do banco TRANSACIONAL (`DATABASE_URL`) para filtrar a escolha da IA
 * contra a lista já cadastrada — removido porque isso deixava ~91% dos CNAEs sem tag nenhuma.
 *
 * **Não rodar sem `--dry-run`/`--limite` antes de conferir o resumo do dry-run** (CLAUDE.md §8).
 * O custo em chamadas de IA é o número de CNAEs distintos AINDA NÃO CACHEADOS (~1.300 no total),
 * não o número de linhas da tabela: com `CategoriaSugeridaPorCnae` já populada, a rodagem faz zero
 * chamadas e executa só a propagação (Parte B).
 */

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const argLimite = args.find((a) => a.startsWith("--limite="))?.split("=")[1];
  const limite = argLimite ? Number(argLimite) : undefined;

  if (argLimite !== undefined && (!Number.isInteger(limite) || (limite ?? 0) <= 0)) {
    console.error(`--limite inválido: "${argLimite}" (esperado inteiro > 0)`);
    process.exitCode = 1;
    return;
  }

  const argConcorrencia = args.find((a) => a.startsWith("--concorrencia="))?.split("=")[1];
  const concorrencia = argConcorrencia ? Number(argConcorrencia) : undefined;

  if (argConcorrencia !== undefined && (!Number.isInteger(concorrencia) || (concorrencia ?? 0) <= 0)) {
    console.error(`--concorrencia inválido: "${argConcorrencia}" (esperado inteiro > 0)`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Iniciando categorização de candidatos por CNAE${dryRun ? " (DRY RUN — nada será gravado)" : ""}` +
      (limite ? `, limitado a ${limite} CNAE(s)` : "") +
      (concorrencia ? `, concorrência ${concorrencia}` : "") +
      "...",
  );

  const resumo = await categorizarCandidatosCnae({ limite, concorrencia, dryRun });

  console.log("\nConcluído:");
  console.log(`  CNAEs distintos encontrados nos candidatos: ${resumo.cnaesEncontrados}`);
  console.log(`  Já cacheados (nenhuma chamada de IA repetida): ${resumo.cnaesJaCacheados}`);
  console.log(`  CNAEs processados nesta rodagem: ${resumo.cnaesProcessados}`);
  console.log(`  ...com categoria sugerida: ${resumo.cnaesComCategoria}`);
  console.log(`  ...sem categoria pertinente: ${resumo.cnaesSemCategoria}`);
  console.log(
    `  Linhas de EmpresaCandidataFornecedor atualizadas (categoriaSugerida antes vazia): ${resumo.linhasAtualizadas}`,
  );
  console.log(`  Erros: ${resumo.erros.length}`);
  if (resumo.erros.length > 0) {
    console.log(JSON.stringify(resumo.erros.slice(0, 20), null, 2));
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((erro: unknown) => {
    console.error("Falha na categorização por CNAE:", erro);
    process.exit(1);
  });
