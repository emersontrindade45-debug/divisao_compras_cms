import * as Sentry from "@sentry/nextjs";

// Ponto de entrada de instrumentação do Next (App Router). Carrega a config do
// Sentry correspondente ao runtime em uso.
//
// Toda a integração é inerte sem `SENTRY_DSN` — ver src/sentry.server.config.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captura erros de Server Components, route handlers e server actions — o
// caminho que os `error.tsx` (client) não enxergam.
export const onRequestError = Sentry.captureRequestError;
