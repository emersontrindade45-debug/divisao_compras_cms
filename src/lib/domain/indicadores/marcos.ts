/**
 * Marcos de tempo do processo (M30.0) — regra pura.
 *
 * Um marco é o PRIMEIRO instante em que o processo atingiu um estado. Ele é
 * observado logo depois de cada escrita que inclui preço, na mesma transação,
 * e gravado uma única vez. Esta função só diz se o estado atual já satisfaz o
 * marco; quem decide "se ainda não estava gravado" é o `updateMany` condicional.
 */

/** Série mínima da IN 65/2021: três preços válidos por item. */
export const SERIE_MINIMA_PRECOS = 3;

export interface EstadoPrecosProcesso {
  /** Preços com status `incluido` somando todos os itens do processo. */
  totalIncluidos: number;
  /** Maior número de preços `incluido` numa mesma série (item). */
  maiorSerieIncluidos: number;
}

export interface MarcosAtingidos {
  primeiraReferencia: boolean;
  serieMinima: boolean;
}

export function marcosAtingidos(estado: EstadoPrecosProcesso): MarcosAtingidos {
  return {
    primeiraReferencia: estado.totalIncluidos > 0,
    serieMinima: estado.maiorSerieIncluidos >= SERIE_MINIMA_PRECOS,
  };
}
