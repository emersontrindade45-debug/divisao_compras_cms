import * as dotenv from "dotenv";
import dns from "node:dns";

dotenv.config();
dns.setDefaultResultOrder("ipv4first");

import { db } from "../src/lib/db";
import { consultarDadosCadastraisCnpj } from "../src/lib/integracoes/situacaoCadastralCnpj";
import { processarComConcorrencia } from "../src/lib/similaridade/processarComConcorrencia";

/**
 * Script de diagnóstico temporário (não faz parte do M26) — não grava nada no banco. Roda a mesma
 * consulta de `enriquecerFornecedoresPorCnpj.ts` mas lista CNPJ + razão social de quem cai em
 * falha temporária/não encontrado, em vez de só contar.
 *
 *   pnpm exec tsx scripts/diagnostico-falhas-cnpj.ts
 */
async function main() {
  const concorrencia = 1;
  const candidatos = await db.fornecedor.findMany({
    where: { status: "ativo", cnpj: { not: null } },
    select: { id: true, cnpj: true, razaoSocial: true },
  });

  const falhas: { cnpj: string; razaoSocial: string; motivo: string }[] = [];
  let ok = 0;

  await processarComConcorrencia(
    candidatos as { id: string; cnpj: string; razaoSocial: string }[],
    concorrencia,
    async (f) => {
      const consulta = await consultarDadosCadastraisCnpj(f.cnpj);
      if (!consulta.encontrado) {
        falhas.push({ cnpj: f.cnpj, razaoSocial: f.razaoSocial, motivo: consulta.motivo });
      } else {
        ok++;
      }
    },
    (f, erro) => {
      falhas.push({
        cnpj: f.cnpj,
        razaoSocial: f.razaoSocial,
        motivo: erro instanceof Error ? erro.message : String(erro),
      });
    },
  );

  console.log(`OK: ${ok} | Falhas: ${falhas.length}`);
  console.log(JSON.stringify(falhas, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
