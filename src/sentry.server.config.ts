import * as Sentry from "@sentry/nextjs";

// Observabilidade de erros em produção (docs/PLAN.md, M11).
//
// A integração é deliberadamente **inerte sem `SENTRY_DSN`**: sem a variável,
// nada é inicializado e a aplicação segue idêntica. Isso mantém dev, CI e o
// build da Vercel funcionando antes de o projeto no Sentry existir — o código
// pode subir sem depender de configuração externa.
//
// Verificado na v10.68.0 que `init()` sem DSN não lança e `captureException()`
// vira no-op; a guarda abaixo evita instalar instrumentação sem propósito.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Amostragem de performance desligada: o objetivo aqui é rastrear erros,
    // não medir latência. Ligar isso tem custo de plano e de ruído.
    tracesSampleRate: 0,
    // `NODE_ENV` distingue produção de preview/dev no painel do Sentry.
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}
