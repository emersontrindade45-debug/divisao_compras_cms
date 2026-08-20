import * as dotenv from "dotenv";

dotenv.config();

import { importarCandidatosCnpj } from "../src/lib/ingestao/importarCandidatosCnpj";

/**
 * Import administrativo manual (M27) do CSV de candidatos a Fornecedor — SP + situação ativa,
 * filtrado externamente via `cnpj-data-pipeline` + DuckDB sobre o dump da Receita Federal. Uso:
 *
 *   npx tsx scripts/importar-candidatos-cnpj-sp.ts --caminho=<path.csv> --competencia=AAAA-MM [--dry-run] [--tamanho-lote=N]
 *
 * **Não rodar contra o banco de produção sem antes validar com `--dry-run` contra uma amostra**
 * (CLAUDE.md §8) — a `DATABASE_URL` do ambiente decide o banco de destino.
 */
async function main() {
  const args = process.argv.slice(2);
  const caminho = args.find((a) => a.startsWith("--caminho="))?.split("=")[1];
  const competenciaRfb = args.find((a) => a.startsWith("--competencia="))?.split("=")[1];
  const dryRun = args.includes("--dry-run");
  const argLote = args.find((a) => a.startsWith("--tamanho-lote="))?.split("=")[1];
  const tamanhoLote = argLote ? Number(argLote) : undefined;

  if (!caminho) {
    console.error("--caminho=<path do CSV> é obrigatório");
    process.exitCode = 1;
    return;
  }

  if (!competenciaRfb || !/^\d{4}-\d{2}$/.test(competenciaRfb)) {
    console.error("--competencia=AAAA-MM é obrigatório (ex.: --competencia=2026-08)");
    process.exitCode = 1;
    return;
  }

  if (argLote !== undefined && (!Number.isInteger(tamanhoLote) || (tamanhoLote ?? 0) <= 0)) {
    console.error(`--tamanho-lote inválido: "${argLote}" (esperado inteiro > 0)`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Iniciando import de candidatos CNPJ${dryRun ? " (DRY RUN — nada será gravado)" : ""} de ${caminho} (competência ${competenciaRfb})...`,
  );

  const resumo = await importarCandidatosCnpj({ caminho, competenciaRfb, dryRun, tamanhoLote });

  console.log("\nConcluído:");
  console.log(`  Importação: ${resumo.importacaoId}`);
  console.log(`  Linhas lidas: ${resumo.linhasLidas}`);
  console.log(`  Linhas importadas: ${resumo.linhasImportadas}`);
  console.log(`  Linhas rejeitadas: ${resumo.linhasRejeitadas}`);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((erro: unknown) => {
    console.error("Falha no import:", erro);
    process.exit(1);
  });
