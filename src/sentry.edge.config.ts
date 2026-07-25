import * as Sentry from "@sentry/nextjs";

// Runtime edge (middleware/proxy). Mesma regra do servidor: inerte sem DSN.
// Ver comentário em sentry.server.config.ts.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}
