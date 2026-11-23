import { timingSafeEqual } from "node:crypto";

/**
 * Autoriza uma chamada de rotina agendada (rotas `/api/jobs/*`): o chamador envia
 * `Authorization: Bearer <CRON_SECRET>`.
 *
 * FAIL-CLOSED (CLAUDE.md §9.45): sem `CRON_SECRET` configurado a resposta é SEMPRE "não". A versão
 * antiga de `/api/jobs/lembretes` fazia `if (secret && ...)` e, com a variável ausente, ficou pública
 * em produção. Comparação em tempo constante para não vazar o segredo pelo tempo de resposta.
 */
export function autorizadoPorCron(request: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const enviado = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return enviado.length === esperado.length && timingSafeEqual(enviado, esperado);
}
