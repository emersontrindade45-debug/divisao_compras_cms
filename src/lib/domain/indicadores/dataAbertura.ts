/**
 * Validação da data de abertura informada pelo analista na importação da
 * planilha (M30.0). Pura: recebe "agora" em vez de ler o relógio (§9.65).
 */

/** Antes disto não há processo da Divisão no sistema; data assim é digitação errada. */
const DATA_MINIMA = "2015-01-01";

export type ResultadoDataAbertura = { ok: true; data: Date } | { ok: false; erro: string };

export function validarDataAberturaInformada(texto: string, agora: Date): ResultadoDataAbertura {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
  if (!m) return { ok: false, erro: "Data de abertura inválida. Use o formato dd/mm/aaaa." };

  // Meio-dia UTC: o mesmo dia civil em qualquer fuso do Brasil, sem virar a
  // data ao formatar no servidor (UTC) ou no navegador (UTC−3).
  const data = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== texto.trim()) {
    return { ok: false, erro: "Data de abertura inválida." };
  }
  if (texto.trim() < DATA_MINIMA) {
    return { ok: false, erro: "Data de abertura anterior a 2015 — confira a digitação." };
  }
  // Compara por dia civil em UTC−3 (Santos), não por instante.
  const hojeSantos = new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (texto.trim() > hojeSantos) {
    return { ok: false, erro: "Data de abertura no futuro." };
  }
  return { ok: true, data };
}
