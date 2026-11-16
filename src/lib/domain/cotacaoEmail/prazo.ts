/**
 * Prazo de resposta de um envio de cotação por e-mail (M30.d, decisão Q46).
 *
 * Vale a data que a Divisão escreveu no assunto ("Entrega: dd/mm/aaaa" — é o prazo de RESPOSTA do
 * fornecedor, confirmado pelo usuário) ou no texto; sem nenhuma, o padrão é o envio + 5 dias
 * úteis. Dias úteis aqui = sem sábado e domingo; feriados não são considerados (o prazo é
 * editável na tela). Pura: datas entram e saem, nenhuma leitura do relógio (§9.65).
 */

export type PrazoOrigem = "assunto" | "corpo" | "padrao";

export const DIAS_UTEIS_PRAZO_PADRAO = 5;

/** Teto de plausibilidade: um prazo além disso é digitação errada, não prazo. */
const MAX_DIAS_ATE_O_PRAZO = 120;

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
/** Santos (UTC−3, sem horário de verão desde 2019). */
const OFFSET_SANTOS_MS = 3 * HORA_MS;

/** Dia civil em Santos, como "meio-dia UTC" — o mesmo dia em qualquer fuso do Brasil. */
function diaCivilSantos(instante: Date): Date {
  const local = new Date(instante.getTime() - OFFSET_SANTOS_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 12),
  );
}

export function somarDiasUteis(inicio: Date, dias: number): Date {
  const atual = diaCivilSantos(inicio);
  let restantes = dias;
  while (restantes > 0) {
    atual.setUTCDate(atual.getUTCDate() + 1);
    const diaSemana = atual.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) restantes -= 1;
  }
  return atual;
}

function lerDataIso(texto: string | null): Date | null {
  const m = texto ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto) : null;
  if (!m) return null;
  const data = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`);
  // Recusa "2026-02-30": o JS o normaliza para março sem avisar.
  return data.toISOString().slice(0, 10) === texto ? data : null;
}

export interface EntradaPrazo {
  /** "AAAA-MM-DD" extraído pelo script; null = não achou. */
  prazo: string | null;
  prazoOrigem: "assunto" | "corpo" | null;
  dataEnvio: Date;
}

export function definirPrazo(e: EntradaPrazo): { prazo: Date; origem: PrazoOrigem } {
  const informado = lerDataIso(e.prazo);
  if (informado && e.prazoOrigem) {
    const envio = diaCivilSantos(e.dataEnvio);
    const dias = (informado.getTime() - envio.getTime()) / DIA_MS;
    // Antes do envio ou longe demais: não é prazo, é erro de digitação — cai no padrão.
    if (dias >= 0 && dias <= MAX_DIAS_ATE_O_PRAZO) {
      return { prazo: informado, origem: e.prazoOrigem };
    }
  }
  return { prazo: somarDiasUteis(e.dataEnvio, DIAS_UTEIS_PRAZO_PADRAO), origem: "padrao" };
}
