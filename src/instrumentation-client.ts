import * as Sentry from "@sentry/nextjs";

// Instrumentação do lado do cliente. Inerte sem DSN, como o restante da
// integração — ver src/sentry.server.config.ts.
//
// Usa `NEXT_PUBLIC_SENTRY_DSN` porque o bundle do cliente só enxerga variáveis
// com o prefixo `NEXT_PUBLIC_`. É esperado que esse DSN fique visível no browser:
// um DSN de cliente só permite **enviar** eventos, não ler dados do projeto.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  });
}
