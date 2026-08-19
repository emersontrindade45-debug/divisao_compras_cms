import * as dotenv from "dotenv";
import dns from "node:dns";

dotenv.config();

// Rodagem real contra produção em 2026-08-19 (3 execuções) teve a contagem de falha temporária
// SUBINDO a cada tentativa (479→519→664) — sintoma de rede, não de rate limit da BrasilAPI: os
// erros eram `ConnectTimeoutError`/`ECONNRESET` batendo em endereço IPv6 (faixa da Cloudflare, que
// hospeda a BrasilAPI), clássico de instabilidade do IPv6 sob NAT virtual do WSL2. Forçar IPv4
// primeiro na resolução DNS evita a rota que está falhando (só afeta este processo do script, não
// o app publicado). Se a causa real for do lado da BrasilAPI, isto não muda nada — mas não custa
// tentar antes de aceitar backoff maior/nova tentativa depois.
dns.setDefaultResultOrder("ipv4first");

import { enriquecerFornecedoresPorCnpj } from "../src/lib/ingestao/enriquecerFornecedoresPorCnpj";

/**
 * Enriquecimento administrativo manual de `Fornecedor` a partir do CNPJ já cadastrado (M26): preenche
 * Cidade/Estado/E-mail/Telefone e sugere Tag (via CNAE) só para quem está com esses campos vazios —
 * nunca sobrescreve dado já preenchido. Exceção: Razão social É corrigida quando diverge da Receita
 * (CNPJ é chave exata, então a Receita é fonte de verdade — ver docstring de
 * `enriquecerFornecedoresPorCnpj.ts`). Uso:
 *
 *   npx tsx scripts/enriquecer-fornecedores-cnpj.ts --dry-run           (não grava, só reporta)
 *   npx tsx scripts/enriquecer-fornecedores-cnpj.ts --dry-run --limite=20   (amostra local)
 *   npx tsx scripts/enriquecer-fornecedores-cnpj.ts                     (grava de verdade)
 *   npx tsx scripts/enriquecer-fornecedores-cnpj.ts --concorrencia=1    (mais lento, menos 429)
 *
 * **Não rodar sem `--dry-run`/`--limite` contra o banco de produção sem antes conferir o resumo do
 * dry-run** (CLAUDE.md §8) — a `DATABASE_URL` do ambiente decide o banco de destino.
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
    `Iniciando enriquecimento por CNPJ${dryRun ? " (DRY RUN — nada será gravado)" : ""}` +
      (limite ? `, limitado a ${limite} fornecedor(es)` : "") +
      (concorrencia ? `, concorrência ${concorrencia}` : "") +
      "...",
  );

  const resumo = await enriquecerFornecedoresPorCnpj({ limite, concorrencia, dryRun });

  console.log("\nConcluído:");
  console.log(`  Processados: ${resumo.processados}`);
  console.log(`  Cidade/Estado preenchidos: ${resumo.cidadeEstadoPreenchidos}`);
  console.log(`  Tag sugerida: ${resumo.categoriaSugerida}`);
  console.log(`  E-mail preenchido: ${resumo.emailPreenchido}`);
  console.log(`  Telefone preenchido: ${resumo.telefonePreenchido}`);
  console.log(`  Razão social corrigida: ${resumo.razaoSocialCorrigida}`);
  console.log(`  Não encontrados na BrasilAPI (CNPJ inexistente na Receita): ${resumo.naoEncontradosNaApi}`);
  console.log(`  Falha temporária (429/5xx/rede — reprocessa numa próxima rodagem): ${resumo.falhaTemporaria}`);
  console.log(`  Sem nada para fazer: ${resumo.semNadaParaFazer}`);
  console.log(`  Erros: ${resumo.erros.length}`);
  if (resumo.erros.length > 0) {
    console.log(JSON.stringify(resumo.erros.slice(0, 20), null, 2));
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((erro: unknown) => {
    console.error("Falha no enriquecimento:", erro);
    process.exit(1);
  });
