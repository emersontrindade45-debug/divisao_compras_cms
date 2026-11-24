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
  const id = process.env.LEVANTAMENTO_GMAIL_PLANILHA_ID?.trim();
  if (!id) return { estado: "nao_configurada" };
  if (!FORMATO_ID.test(id))
    return { estado: "indisponivel", motivo: "O id da planilha do Levantamento tem formato inválido." };

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
