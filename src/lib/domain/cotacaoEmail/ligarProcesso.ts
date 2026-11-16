/**
 * Liga o número do processo escrito no assunto ("Proc. 382") ao `Processo` do sistema (M30.d,
 * decisão Q40/Q51). O assunto traz só o número, sem o ano; o sistema guarda "0382/2026".
 *
 * Compara o número ignorando zeros à esquerda. Se mais de um processo casar (382/2025 e
 * 382/2026), só vale o do ano do envio; sem isso a ligação fica em aberto — um envio "aguardando
 * o processo" é recuperável, uma ligação ao processo errado não é (§9.93).
 */

export interface ProcessoParaLigar {
  id: string;
  numero: string;
}

export interface NumeroProcessoLido {
  numero: string;
  ano: number | null;
}

export function lerNumeroProcesso(texto: string): NumeroProcessoLido | null {
  const t = texto.trim();
  let m = /^(\d{1,6})\s*\/\s*(\d{4})$/.exec(t); // 0382/2026
  if (m) return { numero: String(Number(m[1])), ano: Number(m[2]) };
  m = /^(\d{4})\s*\/\s*(\d{1,6})$/.exec(t); // 2026/001 (ano na frente)
  if (m) return { numero: String(Number(m[2])), ano: Number(m[1]) };
  m = /^(\d{1,6})$/.exec(t); // 382
  if (m) return { numero: String(Number(m[1])), ano: null };
  return null;
}

export function ligarProcesso(
  numeroDoAssunto: string | null,
  anoDoEnvio: number,
  processos: ProcessoParaLigar[],
): string | null {
  const alvo = numeroDoAssunto ? lerNumeroProcesso(numeroDoAssunto) : null;
  if (!alvo) return null;

  const casam = processos.filter((p) => lerNumeroProcesso(p.numero)?.numero === alvo.numero);
  if (casam.length === 1) return casam[0]!.id;
  if (casam.length === 0) return null;

  const doAno = casam.filter((p) => lerNumeroProcesso(p.numero)?.ano === anoDoEnvio);
  return doAno.length === 1 ? doAno[0]!.id : null;
}
