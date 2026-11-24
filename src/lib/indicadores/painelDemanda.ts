import "server-only";
import { parseCsv } from "@/lib/sheets/csv";
import { getSheetsClient, lerAbaAutenticado } from "@/lib/sheets/googleAuth";
import { lerRemessas, type Remessa } from "@/lib/domain/indicadores/demanda";
import {
  dataMaisRecente,
  montarPainelDemanda,
  type CategoriaProcesso,
  type PainelDemanda,
} from "@/lib/domain/indicadores/painelDemanda";
import { baixarCsv, CACHE_SEGUNDOS, FORMATO_GID, FORMATO_ID, mapaDeProcessos, type ProcessoNoSistema } from "./demanda";

/**
 * Leitura das remessas de TODOS os anos para o painel "Demanda da Divisão" (redesenho de 2026-11-24).
 *
 * Fonte preferida: a API autenticada do Google (conta de serviço), abrindo por NOME todas as abas
 * "Remessas <ano>". Assim o comparativo com 2025 e 2024 funciona e a virada de ano não depende de
 * trocar `gid` na Vercel: a aba "Remessas 2027" aparece sozinha quando o primeiro e-mail do ano chega.
 * Exige que a planilha esteja compartilhada com a conta de serviço (leitora).
 *
 * Reserva: sem acesso pela API (planilha não compartilhada, chave ausente, erro do Google), lê a aba
 * única pelo CSV público (`DEMANDA_PLANILHA_GID`) — só o ano dela, sem comparativo — e DIZ isso na tela
 * (`aviso`). Nunca finge ter os anos anteriores.
 *
 * Fail-visible (§9.93): aba com cabeçalho irreconhecível NÃO cai para a reserva nem some do total — a
 * leitura inteira vira "indisponível" com o motivo. Só a falha de ACESSO (não a de conteúdo) usa a reserva.
 *
 * Cache de 1 hora na memória da instância (a API autenticada não passa pelo cache de `fetch` do Next).
 */

const ABA_DE_ANO = /^Remessas (\d{4})$/;

export type FonteRemessas = "api" | "csv";

export type ResultadoPainelDemanda =
  | { estado: "nao_configurada" }
  | { estado: "indisponivel"; motivo: string }
  | {
      estado: "ok";
      painel: PainelDemanda;
      /** Anos que têm remessa, do mais recente ao mais antigo (para o seletor de ano). */
      anos: number[];
      fonte: FonteRemessas;
      /** Explica uma limitação da leitura (ex.: sem comparativo por falta de acesso da API). */
      aviso: string | null;
      descartadas: number;
      duplicadas: number;
      noSistema: Record<string, ProcessoNoSistema>;
    };

interface Leitura {
  remessas: Remessa[];
  fonte: FonteRemessas;
  aviso: string | null;
  descartadas: number;
  duplicadas: number;
}

type TentativaLeitura = { ok: true; leitura: Leitura } | { ok: false; motivo: string };

/** Junta as remessas de várias abas sem repetir o mesmo e-mail + processo (identidade de `lerRemessas`). */
function juntar(partes: Remessa[][]): { remessas: Remessa[]; repetidas: number } {
  const vistos = new Set<string>();
  const remessas: Remessa[] = [];
  let repetidas = 0;
  for (const r of partes.flat()) {
    if (r.idEmail) {
      const par = `${r.idEmail}|${r.chave}`;
      if (vistos.has(par)) {
        repetidas++;
        continue;
      }
      vistos.add(par);
    }
    remessas.push(r);
  }
  return { remessas, repetidas };
}

async function titulosDasAbasDeAno(id: string): Promise<string[]> {
  const meta = await getSheetsClient().spreadsheets.get({ spreadsheetId: id, fields: "sheets.properties.title" });
  return (meta.data.sheets ?? [])
    .map((s) => s.properties?.title ?? "")
    .filter((t) => ABA_DE_ANO.test(t))
    .sort();
}

async function lerPelaApi(id: string): Promise<TentativaLeitura | "sem_acesso" | "sem_abas_de_ano"> {
  let titulos: string[];
  let linhasPorAba: { titulo: string; linhas: string[][] }[];
  try {
    titulos = await titulosDasAbasDeAno(id);
    if (titulos.length === 0) return "sem_abas_de_ano";
    linhasPorAba = [];
    for (const titulo of titulos) linhasPorAba.push({ titulo, linhas: await lerAbaAutenticado(id, titulo) });
  } catch {
    return "sem_acesso";
  }
  const partes: Remessa[][] = [];
  let descartadas = 0;
  let duplicadas = 0;
  for (const { titulo, linhas } of linhasPorAba) {
    const leitura = lerRemessas(linhas);
    if (!leitura.ok) return { ok: false, motivo: `Aba '${titulo}': ${leitura.motivo}` };
    partes.push(leitura.remessas);
    descartadas += leitura.descartadas;
    duplicadas += leitura.duplicadas;
  }
  const { remessas, repetidas } = juntar(partes);
  return { ok: true, leitura: { remessas, fonte: "api", aviso: null, descartadas, duplicadas: duplicadas + repetidas } };
}

async function lerPeloCsv(id: string, gid: string | undefined, motivoDaReserva: string): Promise<TentativaLeitura> {
  const csv = await baixarCsv(id, gid);
  if (!csv.ok) return { ok: false, motivo: csv.motivo };
  const leitura = lerRemessas(parseCsv(csv.texto));
  if (!leitura.ok) return { ok: false, motivo: leitura.motivo };
  return {
    ok: true,
    leitura: {
      remessas: leitura.remessas,
      fonte: "csv",
      aviso: `Só o ano da aba configurada está disponível, sem comparativo com anos anteriores. ${motivoDaReserva}`,
      descartadas: leitura.descartadas,
      duplicadas: leitura.duplicadas,
    },
  };
}

async function lerPlanilha(id: string, gid: string | undefined): Promise<TentativaLeitura> {
  const api = await lerPelaApi(id);
  if (api !== "sem_acesso" && api !== "sem_abas_de_ano") return api;
  const motivo =
    api === "sem_acesso"
      ? "A leitura pela conta de serviço do sistema falhou: confirme que a planilha está compartilhada com ela (como leitora) para ver os anos anteriores."
      : "A planilha ainda não tem abas “Remessas <ano>”.";
  return lerPeloCsv(id, gid, motivo);
}

// ------------------------------------------------------------------ cache (memória da instância)

const TTL_MS = CACHE_SEGUNDOS * 1000;
let cache: { id: string; gid: string | undefined; em: number; leitura: Leitura } | null = null;
let emAndamento: { chave: string; promessa: Promise<TentativaLeitura> } | null = null;

async function lerComCache(id: string, gid: string | undefined): Promise<TentativaLeitura> {
  const agora = Date.now();
  if (cache && cache.id === id && cache.gid === gid && agora - cache.em < TTL_MS) {
    return { ok: true, leitura: cache.leitura };
  }
  const chave = `${id}|${gid ?? ""}`;
  if (emAndamento?.chave === chave) return emAndamento.promessa; // duas telas pedindo ao mesmo tempo: uma leitura só
  const promessa = lerPlanilha(id, gid).then((r) => {
    if (r.ok) cache = { id, gid, em: Date.now(), leitura: r.leitura };
    return r;
  });
  emAndamento = { chave, promessa };
  try {
    return await promessa;
  } finally {
    if (emAndamento?.promessa === promessa) emAndamento = null;
  }
}

// ------------------------------------------------------------------ ponto de entrada

export interface OpcoesPainelDemanda {
  /** Ano do painel; sem ele (ou sem remessa nesse ano) vale o ano mais recente dos dados. */
  ano?: number;
  categoria?: CategoriaProcesso | null;
}

export async function carregarPainelDemanda(opcoes: OpcoesPainelDemanda = {}): Promise<ResultadoPainelDemanda> {
  const id = process.env.DEMANDA_PLANILHA_ID?.trim();
  if (!id) return { estado: "nao_configurada" };
  if (!FORMATO_ID.test(id)) {
    return { estado: "indisponivel", motivo: "O id da planilha configurado tem formato inválido." };
  }
  const gid = process.env.DEMANDA_PLANILHA_GID?.trim() || undefined;
  if (gid && !FORMATO_GID.test(gid)) {
    return { estado: "indisponivel", motivo: "O id da aba configurado (DEMANDA_PLANILHA_GID) tem formato inválido." };
  }

  try {
    const lida = await lerComCache(id, gid);
    if (!lida.ok) return { estado: "indisponivel", motivo: lida.motivo };
    const { leitura } = lida;
    const hoje = dataMaisRecente(leitura.remessas);
    if (hoje === null) return { estado: "indisponivel", motivo: "A planilha não tem remessas válidas." };

    const anos = [...new Set(leitura.remessas.map((r) => r.ano))].sort((a, b) => b - a);
    const ano = opcoes.ano !== undefined && anos.includes(opcoes.ano) ? opcoes.ano : anos[0]!;
    return {
      estado: "ok",
      painel: montarPainelDemanda(leitura.remessas, { ano, hoje, categoria: opcoes.categoria ?? null }),
      anos,
      fonte: leitura.fonte,
      aviso: leitura.aviso,
      descartadas: leitura.descartadas,
      duplicadas: leitura.duplicadas,
      noSistema: await mapaDeProcessos(),
    };
  } catch {
    return { estado: "indisponivel", motivo: "Não foi possível ler a planilha." };
  }
}
