/**
 * Mede a IA contra as regras (M30.d, Fase 2 do modo sombra). SÓ LEITURA, no banco de produção
 * (PROD_READ_URL). Imprime a matriz regra × IA e uma lista de divergências com o link da mensagem
 * no Gmail, para o analista abrir e dizer quem acertou. Nenhum texto de e-mail passa por aqui: o
 * banco guarda só classe, confiança e uma frase curta.
 *
 * Uso: node scripts/medir-ia-sombra.mjs [quantidade_de_divergencias=40]
 */
import fs from "node:fs";
import pg from "pg";

const { Client } = pg;

const env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
const url = process.env.PROD_READ_URL || ((env.match(/^PROD_READ_URL=["']?([^"'\r\n]+)/m) || [])[1] ?? "");
const LIMITE = Number(process.argv[2]) || 40;
const CAIXA = "compras@camarasantos.sp.gov.br";

/** O que as regras disseram, em linguagem comparável com a da IA. */
function rotuloRegra(regra) {
  if (regra === "aplicar:orcamento") return "orcamento";
  if (regra === "aplicar:recusa") return "recusa";
  if (regra === "fila:provavel_orcamento") return "orcamento?";
  if (regra === "fila:provavel_recusa") return "recusa?";
  if (regra === "fila:provavel_duvida") return "duvida?";
  if (regra === "fila:sinais_ambiguos") return "sem sinal";
  return "fila:outro";
}
/** A IA concorda quando a classe é a que a regra indica (com ou sem "?"). */
function concorda(rotulo, classe) {
  const base = rotulo.replace("?", "");
  return base === classe;
}

(async () => {
  if (!url) { console.log("PROD_READ_URL não definida."); return; }
  const c = new Client({ connectionString: url });
  try {
    await c.connect();
    const { rows } = await c.query(
      `select "gmailMensagemId" id, "classeIa", confianca, justificativa, regra,
              to_char("createdAt" at time zone 'America/Sao_Paulo','YYYY-MM-DD HH24:MI') criada
         from classificacoes_ia_resposta order by "createdAt" desc`,
    );
    console.log(`\nRespostas classificadas pela IA em sombra: ${rows.length}`);
    if (rows.length === 0) return;

    const porClasse = {};
    for (const r of rows) {
      const k = `${r.classeIa} / ${r.confianca}`;
      porClasse[k] = (porClasse[k] || 0) + 1;
    }
    console.log("\n## Distribuição da IA (classe / confiança)");
    console.table(porClasse);

    const matriz = {};
    for (const r of rows) {
      const lin = rotuloRegra(r.regra);
      matriz[lin] = matriz[lin] || { orcamento: 0, recusa: 0, duvida: 0, nao_e_resposta: 0, total: 0 };
      matriz[lin][r.classeIa] += 1;
      matriz[lin].total += 1;
    }
    console.log("\n## Matriz: o que as regras disseram (linhas) × o que a IA disse (colunas)");
    console.table(matriz);

    const decididas = rows.filter((r) => r.regra.startsWith("aplicar:"));
    const certas = decididas.filter((r) => concorda(rotuloRegra(r.regra), r.classeIa));
    console.log(
      `\nRegras que JÁ decidiram (anexo PDF / frase de recusa): ${decididas.length}; ` +
        `a IA concorda em ${certas.length} (${decididas.length ? Math.round((100 * certas.length) / decididas.length) : 0}%).`,
    );

    const div = rows.filter((r) => {
      const rot = rotuloRegra(r.regra);
      return rot !== "sem sinal" && rot !== "fila:outro" && !concorda(rot, r.classeIa);
    });
    console.log(`\n## Divergências regra × IA: ${div.length} (mostrando ${Math.min(LIMITE, div.length)})`);
    console.log("Abra cada link e anote quem acertou: REGRA, IA ou NENHUMA.\n");
    for (const r of div.slice(0, LIMITE)) {
      console.log(
        `regra=${rotuloRegra(r.regra).padEnd(11)} ia=${r.classeIa.padEnd(14)} conf=${r.confianca.padEnd(5)} ` +
          `${r.justificativa}\n   https://mail.google.com/mail/?authuser=${encodeURIComponent(CAIXA)}#all/${r.id}`,
      );
    }
  } catch (e) {
    console.log("falhou:", String(e.message).split(url).join("<MASCARADO>"));
  } finally {
    await c.end().catch(() => {});
  }
})();
