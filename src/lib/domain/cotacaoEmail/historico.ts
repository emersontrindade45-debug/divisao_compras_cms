/**
 * Leitura do histórico da caixa "de hoje para trás" em fatias (M30.d). Uma leitura longa estoura
 * o prazo da função do sistema, então o histórico é percorrido em fatias de até 30 dias, da mais
 * recente para a mais antiga. Fatia que o script avisa ter mais fios que o teto é DIVIDIDA ao meio
 * e relida — nunca aceita pela metade, senão parte do histórico ficaria sem ler em silêncio
 * (CLAUDE.md §9.93).
 *
 * Domínio puro: quem lê (`ler`) é injetado.
 */

export interface FatiaLeitura {
  desdeDias: number;
  dias: number;
}

export interface ResultadoFatia {
  /** Erro da leitura; interrompe o histórico. */
  erro?: string;
  /** O script avisou que a fatia tinha mais fios que o teto. */
  truncada?: boolean;
  /** Contagem que será somada no total. */
  contagens?: Record<string, number>;
}

export interface ResultadoHistorico {
  fatiasLidas: number;
  totais: Record<string, number>;
  erro?: string;
  /** Fatia que continuou truncada mesmo com 1 dia — precisa de atenção humana. */
  fatiaSemSolucao?: FatiaLeitura;
}

export const DIAS_POR_FATIA = 30;

export function planejarFatias(totalDias: number): FatiaLeitura[] {
  const fatias: FatiaLeitura[] = [];
  for (let desde = 0; desde < totalDias; desde += DIAS_POR_FATIA) {
    fatias.push({ desdeDias: desde, dias: Math.min(DIAS_POR_FATIA, totalDias - desde) });
  }
  return fatias;
}

/**
 * Só estas contagens são INCREMENTAIS (o que a fatia acrescentou) e podem ser somadas. As demais
 * (`envios`, `respostasNaFila`, `enviosSemProcesso`) descrevem o ESTADO naquele momento: somar
 * contaria a mesma fila várias vezes, e uma fatia reaberta ao meio duplicaria `envios`.
 */
const CHAVES_INCREMENTAIS = new Set([
  "enviosNovos",
  "consultasNovas",
  "respostasClassificadas",
  "emailsInvalidos",
]);

function agregar(totais: Record<string, number>, contagens: Record<string, number> = {}): void {
  for (const [k, v] of Object.entries(contagens)) {
    totais[k] = CHAVES_INCREMENTAIS.has(k) ? (totais[k] ?? 0) + v : v;
  }
}

export async function lerHistorico(
  totalDias: number,
  ler: (f: FatiaLeitura) => Promise<ResultadoFatia>,
  aoAvancar?: (lidas: number) => void,
): Promise<ResultadoHistorico> {
  const resultado: ResultadoHistorico = { fatiasLidas: 0, totais: {} };
  const fila = planejarFatias(totalDias);

  while (fila.length > 0) {
    const fatia = fila.shift()!;
    const r = await ler(fatia);
    if (r.erro) return { ...resultado, erro: r.erro };

    // A fatia truncada também grava o que leu (idempotente); reler as metades cobre o resto.
    agregar(resultado.totais, r.contagens);
    resultado.fatiasLidas += 1;
    aoAvancar?.(resultado.fatiasLidas);

    if (r.truncada) {
      if (fatia.dias <= 1) return { ...resultado, fatiaSemSolucao: fatia };
      const metade = Math.ceil(fatia.dias / 2);
      // A mais recente primeiro, mantendo a ordem "de hoje para trás".
      fila.unshift(
        { desdeDias: fatia.desdeDias, dias: metade },
        { desdeDias: fatia.desdeDias + metade, dias: fatia.dias - metade },
      );
    }
  }
  return resultado;
}
