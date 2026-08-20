import * as dotenv from "dotenv";

dotenv.config();

import { categorizarCandidatosCnae } from "../src/lib/ingestao/categorizarCandidatosCnae";

/**
 * Categorização administrativa (M27 etapa 4) de candidatos a Fornecedor por CNAE. A IA roda uma
 * vez por código CNAE distinto (cache em `CategoriaSugeridaPorCnae`) e o resultado é copiado em
 * massa para `EmpresaCandidataFornecedor.categoriaSugerida` só onde o array ainda está vazio —
 * nunca sobrescreve classificação já gravada. Uso:
 *
 *   npx tsx scripts/categorizar-candidatos-cnae.ts --dry-run
 *   npx tsx scripts/categorizar-candidatos-cnae.ts --dry-run --limite=20
 *   npx tsx scripts/categorizar-candidatos-cnae.ts --limite=50
 *   npx tsx scripts/categorizar-candidatos-cnae.ts --apenas-aplicar
 *   npx tsx scripts/categorizar-candidatos-cnae.ts
 *
 * `--dry-run` ainda chama a IA (para contar o que seria gravado), mas não persiste cache nem
 * aplica o UPDATE — use `--limite` para amostrar. `--apenas-aplicar` não chama a IA: só copia o
 * cache já existente para empresas ainda sem categoria.
 *
 * **Não rodar sem `--dry-run`/`--limite` contra o banco de produção sem antes conferir o resumo**
 * (CLAUDE.md §8) — a `DATABASE_URL` do ambiente decide o banco de destino.
 */

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const apenasAplicar = args.includes("--apenas-aplicar");
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
    `Iniciando categorização por CNAE` +
      (dryRun ? " (DRY RUN — nada será gravado)" : "") +
      (apenasAplicar ? " (apenas aplicar cache existente)" : "") +
      (limite ? `, limitado a ${limite} CNAE(s)` : "") +
      (concorrencia ? `, concorrência ${concorrencia}` : "") +
      "...",
  );

  const resumo = await categorizarCandidatosCnae({ limite, concorrencia, dryRun, apenasAplicar });

  console.log("\nConcluído:");
  console.log(`  CNAEs já em cache: ${resumo.cnaesJaEmCache}`);
  console.log(`  CNAEs enviados à IA: ${resumo.cnaesEnviadosParaIa}`);
  console.log(`  CNAEs gravados no cache: ${resumo.cnaesGravados}`);
  console.log(`  CNAEs sem categoria pertinente: ${resumo.cnaesSemCategoriaPertinente}`);
  console.log(`  Candidatos atualizados: ${resumo.candidatosAtualizados}`);
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
