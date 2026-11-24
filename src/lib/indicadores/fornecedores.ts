import "server-only";
import { lerAbaAutenticado } from "@/lib/sheets/googleAuth";
import { lerPorMes, type MesFornecedor } from "@/lib/domain/indicadores/fornecedoresLevantamento";
// Mesmo formato de id de planilha de `./demanda` (não importa de lá para não puxar o banco).
const FORMATO_ID = /^[A-Za-z0-9_-]{20,80}$/;

/**
 * Leitura da aba "Por mês" da planilha do Levantamento (Gmail → planilha, M30.d) para o painel de demanda.
 * Só pela API autenticada (conta de serviço, leitora): sem reserva pública, porque a classificação não deve
 * depender de um endpoint que pode servir conteúdo obsoleto (§9.78). Falha de leitura NÃO vira zero: o painel
 * mostra "indisponível" com o motivo (§9.93). Cache de 1 hora na instância; falha não entra no cache.
 */

const ABA = "Por mês";
const TTL_MS = 3_600_000;

/**
 * Aceita o que costuma ser colado na variável: só o id, o id entre aspas, ou a URL inteira da planilha
 * (`https://docs.google.com/spreadsheets/d/<id>/edit#gid=0`). Devolve o id ou null se nada parecer um.
 */
export function extrairIdDePlanilha(bruto: string): string | null {
  const limpo = bruto.trim().replace(/^["']+|["']+$/g, "").trim();
  const dentroDaUrl = /\/d\/([A-Za-z0-9_-]+)/.exec(limpo)?.[1];
  const id = dentroDaUrl ?? limpo;
  return FORMATO_ID.test(id) ? id : null;
}

export type ResultadoFornecedores =
  | { estado: "nao_configurada" }
  | { estado: "indisponivel"; motivo: string }
  | { estado: "ok"; meses: MesFornecedor[]; inconsistentes: string[] };

let cache: { id: string; em: number; valor: Extract<ResultadoFornecedores, { estado: "ok" }> } | null = null;
let emAndamento: { id: string; promessa: Promise<ResultadoFornecedores> } | null = null;

async function ler(id: string): Promise<ResultadoFornecedores> {
  let linhas: string[][];
  try {
    linhas = await lerAbaAutenticado(id, ABA);
  } catch {
    return {
      estado: "indisponivel",
      motivo: "Sem acesso à planilha do Levantamento (confira se foi compartilhada com a conta de serviço).",
    };
  }
  const r = lerPorMes(linhas);
  if (!r.ok) return { estado: "indisponivel", motivo: r.motivo };
  return { estado: "ok", meses: r.meses, inconsistentes: r.inconsistentes };
}

export async function carregarFornecedores(): Promise<ResultadoFornecedores> {
  const configurado = process.env.LEVANTAMENTO_GMAIL_PLANILHA_ID?.trim();
  if (!configurado) return { estado: "nao_configurada" };
  const id = extrairIdDePlanilha(configurado);
  if (!id)
    return {
      estado: "indisponivel",
      motivo:
        "O id da planilha do Levantamento (LEVANTAMENTO_GMAIL_PLANILHA_ID) não é válido: use só o trecho entre /d/ e /edit da URL da planilha.",
    };

  if (cache && cache.id === id && Date.now() - cache.em < TTL_MS) return cache.valor;
  if (emAndamento?.id === id) return emAndamento.promessa;
  const promessa = ler(id).then((r) => {
    if (r.estado === "ok") cache = { id, em: Date.now(), valor: r };
    return r;
  });
  emAndamento = { id, promessa };
  try {
    return await promessa;
  } finally {
    if (emAndamento?.promessa === promessa) emAndamento = null;
  }
}
