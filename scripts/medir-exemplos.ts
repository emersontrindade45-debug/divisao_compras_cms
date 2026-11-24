import * as dotenv from "dotenv";

dotenv.config();

import { Client } from "pg";
import { classificarComIa, type ClasseIa, type TrechoParaClassificar } from "../src/lib/emailCotacao/classificarComIa";
import { anexarExemplos } from "../src/lib/emailCotacao/exemplosIa";
import { compararAcerto, type CasoMedido } from "../src/lib/domain/cotacaoEmail/medicaoExemplos";
import { ehClasseExemplo, type ExemploGuardado } from "../src/lib/domain/cotacaoEmail/exemplosIa";

/**
 * Mede se os exemplos anonimizados MELHORAM a 1ª leitura da IA — e decide se `IA_EXEMPLOS=1` pode ser
 * ligada (M30.d). Para cada caso decidido pela Divisão, lê o trecho anonimizado duas vezes (sem e com
 * exemplos) e compara com a classe que a Divisão decidiu. O próprio caso NUNCA é exemplo dele mesmo.
 *
 * Lê os exemplos de PRODUÇÃO (PROD_READ_URL, somente leitura) e chama a OpenAI (OPENAI_API_KEY).
 * Não grava nada. Imprime só contagens e ids de mensagem — nunca o trecho.
 *
 *   node_modules\.bin\tsx.cmd --conditions=react-server scripts/medir-exemplos.ts
 */

async function lerExemplos(): Promise<ExemploGuardado[]> {
  const url = process.env.PROD_READ_URL;
  if (!url) throw new Error("PROD_READ_URL não configurada.");
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const r = await c.query<{ id: string; classe: string; trecho: string }>(
      `select "gmailMensagemId" as id, "classeCorreta" as classe, trecho from exemplos_classificacao_ia order by "gmailMensagemId"`,
    );
    return r.rows.flatMap((l) => (ehClasseExemplo(l.classe) ? [{ id: l.id, classe: l.classe, trecho: l.trecho }] : []));
  } finally {
    await c.end();
  }
}

async function ler(itens: TrechoParaClassificar[]): Promise<Map<string, ClasseIa>> {
  const { vereditos } = await classificarComIa(itens);
  return new Map(vereditos.map((v) => [v.id, v.classe]));
}

async function main() {
  const exemplos = await lerExemplos();
  console.log(`Exemplos guardados: ${exemplos.length}`);
  if (exemplos.length === 0) {
    console.log("Nada a medir: ainda não há exemplos (a coleta precisa rodar antes).");
    return;
  }
  const itens: TrechoParaClassificar[] = exemplos.map((e) => ({ id: e.id, trecho: e.trecho }));
  const comExemplos = anexarExemplos(itens, exemplos); // `anexarExemplos` já exclui o próprio caso (excluirId = item.id)

  const [sem, com] = await Promise.all([ler(itens), ler(comExemplos)]);
  const casos: CasoMedido[] = exemplos.map((e) => ({
    id: e.id,
    classeCorreta: e.classe,
    semExemplos: sem.get(e.id) ?? null,
    comExemplos: com.get(e.id) ?? null,
  }));
  const r = compararAcerto(casos);

  const linha = (nome: string, p: { total: number; semCertos: number; comCertos: number }) =>
    `${nome.padEnd(16)} casos ${String(p.total).padStart(3)} | sem exemplos ${p.semCertos}/${p.total} | com exemplos ${p.comCertos}/${p.total}`;
  console.log("\n" + linha("GERAL", r.geral));
  for (const [classe, p] of Object.entries(r.porClasse)) if (p.total > 0) console.log(linha(classe, p));
  console.log(`\nMelhoraram: ${r.melhoraram.length} | Pioraram: ${r.pioraram.length} | Fora da conta (leitura falhou): ${r.indeterminados}`);
  if (r.pioraram.length > 0) console.log("Ids que pioraram (abra no Gmail para julgar):", r.pioraram.join(", "));
  console.log(`\nVEREDITO: ${r.veredito.podeLigar ? "PODE LIGAR IA_EXEMPLOS=1" : "NÃO LIGAR"}`);
  for (const m of r.veredito.motivos) console.log(` - ${m}`);
}

main().catch((e) => {
  console.error("Falha:", e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/\S+/gi, "<conexão>") : "erro");
  process.exit(1);
});
