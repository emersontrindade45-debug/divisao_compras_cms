import * as dotenv from "dotenv";

dotenv.config();

import { escreverFornecedoresPlanilha } from "../src/lib/sheets/escreverFornecedoresPlanilha";

/**
 * Escreve de volta na planilha Google de fornecedores os campos que o M26
 * enriqueceu no banco (cidade, UF, telefone, e-mail, tags e razão social
 * divergente). Só preenche célula vazia — nunca sobrescreve o que já está na
 * planilha — salvo razão social, que segue a mesma exceção do M26. Uso:
 *
 *   npx tsx scripts/escrever-fornecedores-planilha.ts --dry-run
 *   npx tsx scripts/escrever-fornecedores-planilha.ts --dry-run --limite=20
 *   npx tsx scripts/escrever-fornecedores-planilha.ts
 *
 * Exige `FORNECEDORES_SHEETS_URL`, `GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY` (Editor
 * na planilha) e `DATABASE_URL` do banco de onde ler o cadastro. **Não rodar
 * sem `--dry-run` contra produção sem conferir o resumo** (CLAUDE.md §8): a
 * escrita é na planilha-mestre; a próxima sync M24 vai copiar essas células
 * de volta para o banco.
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
    `Iniciando escrita banco → planilha de fornecedores` +
      (dryRun ? " (DRY RUN — nada será gravado na planilha)" : "") +
      (limite ? `, limitado a ${limite} fornecedor(es)` : "") +
      "...",
  );

  const resultado = await escreverFornecedoresPlanilha({ dryRun, limite });

  console.log("\nConcluído:");
  console.log(`  Aba: ${resultado.abaUtilizada}`);
  console.log(`  Fornecedores casados pelo #: ${resultado.resumo.linhasCasadas}`);
  console.log(
    `  Fornecedores do banco sem linha na planilha: ${resultado.resumo.linhasBancoSemMatch}`,
  );
  console.log(`  Células a preencher: ${resultado.resumo.celulasAPreencher}`);
  console.log(`    Município: ${resultado.resumo.porCampo.cidade}`);
  console.log(`    UF: ${resultado.resumo.porCampo.estado}`);
  console.log(`    Telefone: ${resultado.resumo.porCampo.telefone}`);
  console.log(`    E-mail: ${resultado.resumo.porCampo.email}`);
  console.log(`    Tags: ${resultado.resumo.porCampo.categoria}`);
  console.log(`    Razão social: ${resultado.resumo.porCampo.razaoSocial}`);
  console.log(`  Células gravadas: ${resultado.celulasEscritas}`);
  console.log(`  Lotes enviados: ${resultado.lotesEnviados}`);

  const amostra = resultado.atualizacoes.slice(0, 20);
  if (amostra.length > 0) {
    console.log("\nAmostra (até 20 células):");
    for (const a of amostra) {
      console.log(
        `  #${a.linhaId} ${a.campo} (linha ${a.linhaPlanilha}): ${JSON.stringify(a.valorAnterior)} → ${JSON.stringify(a.valorNovo)}`,
      );
    }
    if (resultado.atualizacoes.length > amostra.length) {
      console.log(`  … e mais ${resultado.atualizacoes.length - amostra.length}`);
    }
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((erro: unknown) => {
    console.error("Falha na escrita da planilha de fornecedores:", erro);
    process.exit(1);
  });
