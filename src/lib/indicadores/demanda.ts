import "server-only";
import { db } from "@/lib/db";

/**
 * Peças comuns da leitura da planilha de remessas (M30.e), usadas por `painelDemanda.ts`: o download do CSV
 * público (reserva), os formatos aceitos de id/aba e o vínculo dos processos da planilha com o cadastro.
 *
 * Fail-visible (§9.93): planilha que não abre NÃO vira "0 processos" — `baixarCsv` devolve o motivo e quem
 * chama mostra a frase certa. O id da planilha vem do ambiente, não do código.
 *
 * A exportação em CSV devolve SEMPRE a primeira aba; a aba certa se escolhe por `gid` (`DEMANDA_PLANILHA_GID`).
 */

export const PRAZO_LEITURA_MS = 10_000;
export const CACHE_SEGUNDOS = 3600;
/** Teto do corpo: a planilha tem ~55 KB; acima disso algo está errado (ou não é CSV). */
const MAX_BYTES = 5_000_000;
/** Ids de planilha do Google: letras, dígitos, "-" e "_". Barra o que poderia alterar a URL. */
export const FORMATO_ID = /^[A-Za-z0-9_-]{20,80}$/;
/** O `gid` de uma aba é um número. Só dígitos: nada que altere a URL passa. */
export const FORMATO_GID = /^\d{1,12}$/;

export interface ProcessoNoSistema {
  id: string;
  numero: string;
}

/** "0092/2026" → "92/2026": mesma chave que `chaveDoProcesso` usa para a planilha. */
export function chaveDoNumero(numero: string): string | null {
  const m = /(\d+)\s*\/\s*(\d{4})/.exec(numero);
  return m ? `${Number(m[1])}/${m[2]}` : null;
}

export async function baixarCsv(id: string, gid?: string): Promise<{ ok: true; texto: string } | { ok: false; motivo: string }> {
  let res: Response;
  try {
    res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ""}`, {
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
export async function mapaDeProcessos(): Promise<Record<string, ProcessoNoSistema>> {
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
