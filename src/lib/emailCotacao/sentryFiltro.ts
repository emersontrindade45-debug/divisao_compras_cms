/**
 * Filtro do Sentry para o módulo de e-mail de cotação (M30.d, decisão Q30).
 *
 * O conteúdo de e-mail é sigiloso e não pode chegar a serviço externo. Uma exceção lançada dentro
 * do módulo poderia carregar, na mensagem ou nos dados da requisição, trechos do que o script do
 * Google devolveu. Este filtro DESCARTA o evento inteiro quando qualquer quadro da pilha vem do
 * módulo — preferimos perder um erro a vazar um dado.
 */

const MARCADORES_DO_MODULO = ["emailCotacao", "verificarRespostasEmail"];

interface QuadroPilha {
  filename?: string;
  module?: string;
}

interface EventoSentry {
  exception?: { values?: Array<{ stacktrace?: { frames?: QuadroPilha[] } }> };
  request?: unknown;
}

export function veioDoModuloDeEmail(evento: EventoSentry): boolean {
  const quadros = (evento.exception?.values ?? []).flatMap((v) => v.stacktrace?.frames ?? []);
  return quadros.some((q) =>
    MARCADORES_DO_MODULO.some((m) => `${q.filename ?? ""} ${q.module ?? ""}`.includes(m)),
  );
}

/** Para `Sentry.init({ beforeSend })`: devolve `null` para descartar o evento. */
export function descartarEventosDeEmail<T extends EventoSentry>(evento: T): T | null {
  return veioDoModuloDeEmail(evento) ? null : evento;
}
