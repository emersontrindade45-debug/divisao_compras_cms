import * as dotenv from "dotenv";

dotenv.config();

import { Client } from "pg";
import { OpenAIProvider } from "../src/lib/ia/openaiProvider";
import { rankearEmLotesParalelos } from "../src/lib/similaridade/rankearEmLotesParalelos";
import type { CandidatoSimilaridade } from "../src/lib/ia/types";

/**
 * Isola o efeito do CORTE por IA, sem a variável do tempo de busca.
 *
 * A régua com `--ia` mediu os dois efeitos juntos e ficou ambígua: o número de
 * editais encontrados caiu (11 -> 4), então não dá para saber se o positivo
 * sumiu porque a IA o cortou ou porque a busca nem o trouxe. Aqui os candidatos
 * vêm do BANCO (os que o analista realmente viu e rotulou), não da rede — o
 * conjunto é fixo e idêntico entre execuções.
 *
 * A pergunta que este script responde: **dado o candidato que o analista
 * aprovou, a IA o mantém ou o corta?**
 *
 *   npx tsx --conditions=react-server scripts/medir-corte-ia.ts
 */

const SQL = `
  select r."termoBuscaUsado" as termo,
         r."fonteDescricao"  as fonte_descricao,
         r."valorUnitario"::float8 as valor_unitario,
         r."promovidoParaFonte" as promovido,
         r.descartado        as descartado,
         i.descricao         as item_descricao,
         coalesce(i."caracteristicasTecnicas", '') as item_espec,
         i.unidade           as item_unidade
  from resultados_similaridade r
  join itens i on i.id = r."itemId"
  where r.origem = 'assistente'
    and r."termoBuscaUsado" is not null
  order by r."termoBuscaUsado"
`;

interface Linha {
  termo: string;
  fonte_descricao: string;
  valor_unitario: number;
  promovido: boolean;
  descartado: boolean;
  item_descricao: string;
  item_espec: string;
  item_unidade: string;
}

function rotulo(l: Linha): "fonte" | "descartado" | "mantido" {
  return l.promovido ? "fonte" : l.descartado ? "descartado" : "mantido";
}

async function main(): Promise<void> {
  const url = process.env.AVALIACAO_DB_URL ?? process.env.PROD_READ_URL;
  if (!url) throw new Error("Defina PROD_READ_URL no .env.");
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  const { rows } = await cliente.query<Linha>(SQL);
  await cliente.end();

  const porTermo = new Map<string, Linha[]>();
  for (const r of rows) {
    if (!porTermo.has(r.termo)) porTermo.set(r.termo, []);
    porTermo.get(r.termo)!.push(r);
  }

  // Só termos que têm ao menos um positivo: são os que respondem a pergunta.
  const termos = [...porTermo.entries()]
    .filter(([, ls]) => ls.some((l) => !l.descartado))
    .slice(0, 8);

  const provedor = new OpenAIProvider();
  let mantidosPos = 0;
  let totalPos = 0;
  let mantidosNeg = 0;
  let totalNeg = 0;

  for (const [termo, linhas] of termos) {
    const candidatos: CandidatoSimilaridade[] = linhas.map((l) => ({
      tipoCandidato: "contratacao_publica",
      fonteDescricao: l.fonte_descricao,
      fonteOrgaoOuId: "Órgão",
      valorUnitario: l.valor_unitario,
      // Data de hoje: a recência já foi julgada em outro ponto; aqui só o
      // corte de RELEVÂNCIA está sob teste.
      dataReferencia: new Date(),
      // `ResultadoSimilaridade` não persiste a unidade do candidato; usa a do item.
      unidade: l.item_unidade,
      quantidade: 1,
    }));

    const primeira = linhas[0]!;
    const ranqueados = await rankearEmLotesParalelos(
      {
        descricao: primeira.item_descricao,
        especificacaoTecnica: primeira.item_espec,
        unidade: primeira.item_unidade,
        quantidade: 1,
      },
      candidatos,
      provedor,
    );

    const sobreviventes = new Set(
      (ranqueados ?? []).map((r) => r.candidato.fonteDescricao),
    );
    console.log(`\n"${termo}"  (${linhas.length} rotulados)`);
    for (const l of linhas) {
      const r = rotulo(l);
      const ficou = sobreviventes.has(l.fonte_descricao);
      if (r === "descartado") {
        totalNeg++;
        if (ficou) mantidosNeg++;
      } else {
        totalPos++;
        if (ficou) mantidosPos++;
      }
      const marca = ficou ? "MANTEVE " : "cortou  ";
      if (r !== "descartado" || !ficou) {
        console.log(`   ${marca} [${r}] ${l.fonte_descricao.slice(0, 60)}`);
      }
    }
  }

  console.log("\n════════════════════════════════════════════");
  console.log(`POSITIVOS mantidos pela IA:  ${mantidosPos}/${totalPos}  <- quanto MAIOR, melhor`);
  console.log(`NEGATIVOS mantidos pela IA:  ${mantidosNeg}/${totalNeg}  <- quanto MENOR, melhor`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
