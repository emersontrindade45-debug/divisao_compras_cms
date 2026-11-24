import * as dotenv from "dotenv";

dotenv.config();

import { parseCsv } from "../src/lib/sheets/csv";
import { lerRemessas, type Remessa } from "../src/lib/domain/indicadores/demanda";
import { dataMaisRecente, filtrarRemessas, resumirPeriodo, serieMensal, detalharProcessos, categoriaDoRotulo } from "../src/lib/domain/indicadores/painelDemanda";

/**
 * PROVA REAL do painel "Demanda da Divisão": confronta o cálculo do SISTEMA (TypeScript) com o cálculo da
 * PLANILHA (Apps Script, aba "Painel Remessas"). São duas implementações escritas separadamente sobre as mesmas
 * abas "Remessas <ano>"; se concordam em volume, devoluções, séries, categorias e processos, o número está certo.
 *
 * Só LEITURA. Lê pelo CSV público (precisa só de DEMANDA_PLANILHA_ID). Como o CSV exige o `gid` de cada aba,
 * passe-os em DEMANDA_GIDS (a URL de cada aba mostra `gid=…`):
 *
 *   DEMANDA_GIDS="2024:<gid>,2025:<gid>,2026:<gid>,painel:<gid>" pnpm tsx scripts/conferir-painel-demanda.ts
 *
 * Sai com código 1 se algum número diverge. Não imprime o id da planilha nem texto de e-mail.
 */

const ID = process.env.DEMANDA_PLANILHA_ID?.trim();
const GIDS = Object.fromEntries(
  (process.env.DEMANDA_GIDS ?? "")
    .split(",")
    .map((p) => p.trim().split(":"))
    .filter((p) => p.length === 2),
) as Record<string, string>;

async function csv(gid: string): Promise<string[][]> {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=${gid}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} na aba gid=${gid}`);
  return parseCsv(await res.text());
}

let falhas = 0;
function confere(nome: string, sistema: unknown, planilha: unknown) {
  const a = JSON.stringify(sistema);
  const b = JSON.stringify(planilha);
  const ok = a === b;
  if (!ok) falhas++;
  console.log(`${ok ? "OK      " : "DIVERGE "} ${nome}${ok ? ` = ${a}` : `\n           sistema:  ${a}\n           planilha: ${b}`}`);
}

const num = (v: string | undefined) => Number(String(v ?? "").replace(/\./g, "").replace(",", ".").replace("%", ""));

async function main() {
  if (!ID) throw new Error("DEMANDA_PLANILHA_ID não configurada.");
  const anos = Object.keys(GIDS).filter((k) => /^\d{4}$/.test(k));
  if (anos.length === 0 || !GIDS.painel) throw new Error("Informe DEMANDA_GIDS com os anos e o 'painel'.");

  const todas: Remessa[] = [];
  for (const ano of anos) {
    const lida = lerRemessas(await csv(GIDS[ano]!));
    if (!lida.ok) throw new Error(`Aba ${ano}: ${lida.motivo}`);
    console.log(`Aba ${ano}: ${lida.remessas.length} remessas (descartadas ${lida.descartadas}, duplicadas ${lida.duplicadas})`);
    todas.push(...lida.remessas);
  }
  const hoje = dataMaisRecente(todas)!;
  const ano = Number(hoje.slice(0, 4));
  const doAno = filtrarRemessas(todas, { ano });
  const r = resumirPeriodo(doAno);

  // A aba "Painel Remessas" é gerada pelo script da planilha a cada hora: pode estar até 1h atrás do dado lido agora.
  const painel = await csv(GIDS.painel);
  const cel = (ref: string) => {
    const col = ref.charCodeAt(0) - 65;
    const lin = Number(ref.slice(1)) - 1;
    return painel[lin]?.[col];
  };
  const carimbo = /Atualizado em (\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}).*última remessa em (\d{2}\/\d{2}\/\d{4})/.exec(painel[3]?.[1] ?? "");
  console.log(`\nPainel da planilha: atualizado em ${carimbo?.[1] ?? "?"}; última remessa que ele viu: ${carimbo?.[2] ?? "?"}; última lida agora: ${hoje.split("-").reverse().join("/")}`);
  const painelEstaDefasado = carimbo?.[2] !== hoje.split("-").reverse().join("/");
  if (painelEstaDefasado) console.log("ATENÇÃO: o painel da planilha ainda não incluiu a remessa mais recente; diferenças de 1–2 unidades podem vir daí.\n");

  console.log(`\n=== ${ano}: totais (Q2:R7 do painel) ===`);
  confere("Remessas brutas", r.remessas, num(cel("R2")));
  confere("Processos únicos", r.processos, num(cel("R3")));
  confere("Devoluções (além da 3ª)", r.devolucoes, num(cel("R4")));
  confere("Processos devolvidos", r.processosDevolvidos, num(cel("R5")));
  confere("Taxa de devolução (%, 1 casa)", Math.round(r.taxaDevolucao * 1000) / 10, Math.round(num(cel("R6")) * 10) / 10);
  confere("Processos sem devolução (%, 1 casa)", Math.round((1 - r.processosDevolvidos / r.processos) * 1000) / 10, Math.round(num(cel("R7")) * 10) / 10);

  console.log(`\n=== ${ano}: remessas por mês (I7:J do painel) ===`);
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const painelMeses: Record<string, number> = {};
  for (let lin = 6; lin < 6 + 12; lin++) {
    const nome = painel[lin]?.[8];
    if (nome && meses.includes(nome)) painelMeses[nome] = num(painel[lin]?.[9]);
  }
  const serie = serieMensal(doAno);
  for (let i = 0; i < 12; i++) {
    if (!(meses[i]! in painelMeses) && serie[i]!.remessas === 0) continue;
    confere(meses[i]!, serie[i]!.remessas, painelMeses[meses[i]!] ?? 0);
  }

  console.log(`\n=== ${ano}: remessas por categoria (B15:E do painel; "Outros" soma as pequenas) ===`);
  const porCat: Record<string, number> = { bens: 0, servicos: 0, geral: 0, outros: 0 };
  for (let lin = 14; lin < 24; lin++) {
    const nome = painel[lin]?.[1];
    if (!nome) continue;
    const n = num(painel[lin]?.[3]);
    const id = nome === "Aquisição de Bens" ? "bens" : nome === "Aquisição de Serviços" ? "servicos" : nome.startsWith("Geral") ? "geral" : "outros";
    porCat[id]! += n;
  }
  for (const id of ["bens", "servicos", "geral", "outros"] as const) {
    confere(id, doAno.filter((x) => categoriaDoRotulo(x.rotulo) === id).length, porCat[id]);
  }

  console.log(`\n=== ${ano}: processos (Q11:S do painel, por rótulo) ===`);
  const painelProc = new Map<string, [number, number]>();
  for (let lin = 10; lin < painel.length; lin++) {
    const rot = painel[lin]?.[16];
    if (rot) painelProc.set(rot, [num(painel[lin]?.[17]), num(painel[lin]?.[18])]);
  }
  const sistemaProc = new Map(detalharProcessos(doAno).map((p) => [p.rotulo, [p.passagens, p.devolucoes] as [number, number]]));
  confere("quantidade de processos listados", sistemaProc.size, painelProc.size);
  let diferentes = 0;
  const amostra: string[] = [];
  for (const [rot, v] of sistemaProc) {
    const o = painelProc.get(rot);
    if (!o || o[0] !== v[0] || o[1] !== v[1]) {
      diferentes++;
      if (amostra.length < 5) amostra.push(`${rot}: sistema ${v.join("/")} · planilha ${o ? o.join("/") : "ausente"}`);
    }
  }
  confere("processos com passagens/devoluções iguais nos dois lados (divergentes)", diferentes, 0);
  for (const a of amostra) console.log(`           ${a}`);

  console.log(`\n${falhas === 0 ? "TUDO CONFERE." : `${falhas} DIVERGÊNCIA(S).`}`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Falha:", e instanceof Error ? e.message : e);
  process.exit(2);
});
