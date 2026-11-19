import "server-only";
import { db } from "@/lib/db";
import { parseCsv } from "@/lib/sheets/csv";
import { calcularDemanda, lerRemessas, type DemandaDivisao } from "@/lib/domain/indicadores/demanda";

/**
 * Leitura da planilha de remessas (M30.e) para a camada "Demanda da Divisão" do dashboard.
 *
 * A planilha é atualizada de hora em hora fora do sistema e está com link público de leitura
 * (decisão do usuário, 2026-11-19). O sistema a lê SOB DEMANDA — nada é copiado para o banco — com
 * cache de 1 hora, que acompanha a atualização dela.
 *
 * Fail-visible (§9.93): planilha que não abre NÃO vira "0 processos". O resultado distingue
 * "não configurada", "indisponível" (com o motivo) e "ok"; a tela mostra cada um com sua frase. E a
 * leitura nunca derruba o dashboard: todo erro é capturado aqui.
 *
 * O id da planilha vem do ambiente (`DEMANDA_PLANILHA_ID`), não do código: com link público o id
 * funciona como chave de leitura e não deve entrar no repositório.
 */

export const PRAZO_LEITURA_MS = 10_000;
export const CACHE_SEGUNDOS = 3600;
/** Teto do corpo: a planilha tem ~55 KB; acima disso algo está errado (ou não é CSV). */
const MAX_BYTES = 5_000_000;
/** Ids de planilha do Google: letras, dígitos, "-" e "_". Barra o que poderia alterar a URL. */
const FORMATO_ID = /^[A-Za-z0-9_-]{20,80}$/;

export interface ProcessoNoSistema {
  id: string;
  numero: string;
}

export type ResultadoDemanda =
  | { estado: "nao_configurada" }
  | { estado: "indisponivel"; motivo: string }
  | {
      estado: "ok";
      demanda: DemandaDivisao;
      descartadas: number;
      duplicadas: number;
      /** Processos da planilha que existem no cadastro do sistema, pela chave número/ano. */
      noSistema: Record<string, ProcessoNoSistema>;
    };

/** "0092/2026" → "92/2026": mesma chave que `chaveDoProcesso` usa para a planilha. */
export function chaveDoNumero(numero: string): string | null {
  const m = /(\d+)\s*\/\s*(\d{4})/.exec(numero);
  return m ? `${Number(m[1])}/${m[2]}` : null;
}

async function baixarCsv(id: string): Promise<{ ok: true; texto: string } | { ok: false; motivo: string }> {
  let res: Response;
  try {
    res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv`, {
      signal: AbortSignal.timeout(PRAZO_LEITURA_MS),
      next: { revalidate: CACHE_SEGUNDOS },
    });
  } catch {
    return { ok: false, motivo: "O Google não respondeu a tempo." };
  }
  if (!res.ok) {
    return {
      ok: false,
      motivo:
        res.status === 401 || res.status === 403
          ? "A planilha não está com o link público de leitura."
          : `O Google respondeu com erro ${res.status}.`,
    };
  }
  // O Google devolve uma página HTML (login) com status 200 em alguns casos: só CSV vale.
  if (!(res.headers.get("content-type") ?? "").toLowerCase().includes("text/csv")) {
    return { ok: false, motivo: "A resposta do Google não é uma planilha em CSV." };
  }
  const texto = await res.text();
  if (texto.length > MAX_BYTES) return { ok: false, motivo: "A planilha é maior que o esperado." };
  return { ok: true, texto };
}

/** Processos cadastrados no sistema, por número/ano. Falha aqui só tira o link, não a seção. */
async function mapaDeProcessos(): Promise<Record<string, ProcessoNoSistema>> {
  try {
    const processos = await db.processo.findMany({ select: { id: true, numero: true } });
    const mapa: Record<string, ProcessoNoSistema> = {};
    for (const p of processos) {
      const chave = chaveDoNumero(p.numero);
      if (chave) mapa[chave] = { id: p.id, numero: p.numero };
    }
    return mapa;
  } catch {
    return {};
  }
}

export async function carregarDemanda(ano: number): Promise<ResultadoDemanda> {
  const id = process.env.DEMANDA_PLANILHA_ID?.trim();
  if (!id) return { estado: "nao_configurada" };
  if (!FORMATO_ID.test(id)) {
    return { estado: "indisponivel", motivo: "O id da planilha configurado tem formato inválido." };
  }

  try {
    const csv = await baixarCsv(id);
    if (!csv.ok) return { estado: "indisponivel", motivo: csv.motivo };
    const leitura = lerRemessas(parseCsv(csv.texto));
    if (!leitura.ok) return { estado: "indisponivel", motivo: leitura.motivo };
    return {
      estado: "ok",
      demanda: calcularDemanda(leitura.remessas, ano),
      descartadas: leitura.descartadas,
      duplicadas: leitura.duplicadas,
      noSistema: await mapaDeProcessos(),
    };
  } catch {
    return { estado: "indisponivel", motivo: "Não foi possível ler a planilha." };
  }
}
