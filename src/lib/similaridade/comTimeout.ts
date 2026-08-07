/** Erro lançado quando `comTimeout` estoura o prazo antes da promessa resolver. */
export class TimeoutError extends Error {
  constructor(rotulo: string, timeoutMs: number) {
    super(`[${rotulo}] excedeu o timeout de ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Corre `promessa` contra um relógio: se `timeoutMs` passar antes dela
 * resolver ou rejeitar, a promessa devolvida rejeita com `TimeoutError`.
 *
 * Existe para o registry de provedores de busca (docs/ApiPlan.md §3.4): sem
 * um teto por provedor, uma fonte lenta ou fora do ar prende a busca inteira
 * pelo tempo que ela levar (ou nunca resolver), estourando o orçamento de
 * tempo da função serverless mesmo com os demais provedores respondendo rápido.
 *
 * Não cancela o trabalho de `promessa` (`fetch` sem `AbortController` continua
 * em segundo plano) — só para de esperar por ela. Cancelamento de verdade fica
 * a cargo do provedor, se algum dia precisar.
 */
export function comTimeout<T>(
  promessa: Promise<T>,
  timeoutMs: number,
  rotulo: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const temporizador = setTimeout(() => {
      reject(new TimeoutError(rotulo, timeoutMs));
    }, timeoutMs);

    promessa.then(
      (valor) => {
        clearTimeout(temporizador);
        resolve(valor);
      },
      (erro: unknown) => {
        clearTimeout(temporizador);
        reject(erro);
      },
    );
  });
}
