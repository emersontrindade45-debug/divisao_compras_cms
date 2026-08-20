import * as dotenv from "dotenv";

dotenv.config();

import { devolverEnriquecimentoParaPlanilha } from "../src/lib/ingestao/devolverEnriquecimentoParaPlanilha";

/**
 * Devolve à planilha Google de fornecedores (M24) os campos que o enriquecimento por CNPJ (M26)
 * preencheu no banco — sem isso, a próxima sincronização do M24 apagaria Cidade/UF/Telefone/
 * E-mail/Tags que o M26 buscou na Receita, porque a planilha nunca recebeu esse dado de volta
 * (ver docs/PLAN.md M27). Só escreve em célula VAZIA da planilha; razão social é a única exceção
 * (sobrescreve quando diverge). Uso:
 *
 *   npx tsx scripts/devolver-enriquecimento-planilha.ts --dry-run              (não grava, só reporta)
 *   npx tsx scripts/devolver-enriquecimento-planilha.ts --dry-run --limite=20  (amostra local)
 *   npx tsx scripts/devolver-enriquecimento-planilha.ts                       (grava de verdade)
 *
 * **Não rodar sem `--dry-run`/`--limite` antes de conferir o resumo** (CLAUDE.md §8) — a
 * `DATABASE_URL` do ambiente decide o banco de origem, e `FORNECEDORES_SHEETS_URL` decide a
 * planilha de destino real.
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

  console.log(
    `Devolvendo enriquecimento à planilha${dryRun ? " (DRY RUN — nada será gravado)" : ""}` +
      (limite ? `, limitado a ${limite} fornecedor(es)` : "") +
      "...",
  );

  const resumo = await devolverEnriquecimentoParaPlanilha({ limite, dryRun });

  console.log("\nConcluído:");
  console.log(`  Linhas atualizadas na planilha: ${resumo.linhasAtualizadas}`);
  console.log(
    `  Linhas não encontradas na planilha (linhaId sumiu): ${resumo.linhasNaoEncontradas.length}`,
  );
  console.log(
    `  Campos ignorados por já estarem preenchidos na planilha: ${resumo.camposIgnoradosPorJaPreenchidos}`,
  );
  if (resumo.linhasNaoEncontradas.length > 0) {
    console.log(JSON.stringify(resumo.linhasNaoEncontradas.slice(0, 20), null, 2));
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((erro: unknown) => {
    console.error("Falha ao devolver enriquecimento à planilha:", erro);
    process.exit(1);
  });
