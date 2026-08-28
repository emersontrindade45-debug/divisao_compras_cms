import * as dotenv from "dotenv";

dotenv.config();

import { enriquecerCandidatosSicaf } from "../src/lib/ingestao/enriquecerCandidatosSicaf";

/**
 * Cruza os candidatos a Fornecedor (M27) com o SICAF (compras.gov.br) e marca em
 * `EmpresaCandidataFornecedor.sicafHabilitado` quem já está habilitado a licitar com o governo
 * federal — sinal de prioridade na tela de descoberta de fornecedores, não um filtro exclusivo.
 *
 *   npx tsx scripts/enriquecer-candidatos-sicaf.ts --dry-run              (não grava, só reporta)
 *   npx tsx scripts/enriquecer-candidatos-sicaf.ts                       (grava de verdade)
 *   npx tsx scripts/enriquecer-candidatos-sicaf.ts --concorrencia=2      (mais lento, menos risco de rate limit)
 *   npx tsx scripts/enriquecer-candidatos-sicaf.ts --checkpoint=<arquivo.json>
 *
 * Usa `DATABASE_CANDIDATOS_ADMIN_URL` (credencial de escrita, só na máquina do operador — CLAUDE.md
 * §9.82). Busca o SICAF particionado por CNAE (~1.300 fatias pequenas, não uma paginação linear do
 * dataset inteiro — ver docstring de `enriquecerCandidatosSicaf` para por que isso importa: a API
 * degrada com profundidade de página e uma versão anterior desta rodagem ficou 35 minutos sem
 * terminar). Imprime progresso a cada CNAE processado; se qualquer um falhar após retry, a função
 * lança e nada é gravado no banco.
 *
 * **Use `--checkpoint` numa rodagem completa.** A API impõe rate limit (HTTP 429) e a coleta leva
 * minutos: sem checkpoint, uma falha no meio descarta tudo que já foi baixado (medido em
 * 2026-08-28: 340s e ~99 mil CNPJs perdidos). Com ele, basta rodar de novo — os CNAEs já
 * concluídos são pulados. O arquivo é só da COLETA; a escrita no banco segue tudo-ou-nada.
 */

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const argConcorrencia = args.find((a) => a.startsWith("--concorrencia="))?.split("=")[1];
  const concorrencia = argConcorrencia ? Number(argConcorrencia) : undefined;

  if (argConcorrencia !== undefined && (!Number.isInteger(concorrencia) || (concorrencia ?? 0) <= 0)) {
    console.error(`--concorrencia inválido: "${argConcorrencia}" (esperado inteiro > 0)`);
    process.exitCode = 1;
    return;
  }

  const caminhoCheckpoint = args.find((a) => a.startsWith("--checkpoint="))?.split("=")[1];

  console.log(
    `Cruzando o SICAF (compras.gov.br) com os candidatos a Fornecedor, por CNAE${dryRun ? " (DRY RUN — nada será gravado)" : ""}` +
      (concorrencia ? `, concorrência ${concorrencia}` : "") +
      (caminhoCheckpoint ? `, checkpoint em ${caminhoCheckpoint}` : "") +
      "...",
  );

  const inicio = Date.now();
  const resumo = await enriquecerCandidatosSicaf({
    concorrencia,
    dryRun,
    caminhoCheckpoint,
    onProgresso: ({ cnaesProcessados, cnaesTotal, cnpjsEncontrados }) => {
      if (cnaesProcessados % 50 !== 0 && cnaesProcessados !== cnaesTotal) return;
      const decorridoS = ((Date.now() - inicio) / 1000).toFixed(0);
      console.log(
        `  [${decorridoS}s] CNAE ${cnaesProcessados}/${cnaesTotal} — ${cnpjsEncontrados} CNPJs encontrados até agora`,
      );
    },
  });

  console.log("\nConcluído:");
  console.log(`  CNAEs consultados: ${resumo.cnaesConsultados}`);
  console.log(`  CNPJs habilitados a licitar encontrados: ${resumo.cnpjsHabilitadosEncontrados}`);
  console.log(`  Linhas de candidatos marcadas como habilitadas: ${resumo.linhasMarcadas}`);
  console.log(`  Linhas desmarcadas (saíram do SICAF desde a última rodagem): ${resumo.linhasDesmarcadas}`);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((erro: unknown) => {
    console.error("Falha no enriquecimento por SICAF:", erro);
    process.exit(1);
  });
