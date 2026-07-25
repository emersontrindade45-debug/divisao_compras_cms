import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  serverExternalPackages: ["@prisma/client"],
  // /api/admin/migrate lê os arquivos .sql do disco em runtime e os executa via
  // `pg` — só as migrations precisam entrar no bundle da função.
  //
  // O CLI do Prisma **não** é mais empacotado aqui. Empacotá-lo custou três
  // ciclos de deploy sem nunca funcionar: o require do CLI não resolvia no
  // bundle (§9.18), o glob amplo estourou o limite de tamanho da função com
  // 228 MB (§9.26) e a lista estreita deixou de fora a árvore transitiva
  // (§9.28). Ao trocar o subprocesso por SQL direto, o problema deixa de
  // existir em vez de ser contornado.
  outputFileTracingIncludes: {
    "/api/admin/migrate": ["./prisma/migrations/**"],
  },
};

// `withSentryConfig` NÃO é usado aqui, e isso é deliberado.
//
// O wrapper serve a upload de source maps e criação de releases — não à captura
// de erros, que funciona apenas com `src/instrumentation.ts`. Em troca, ele exige
// `SENTRY_AUTH_TOKEN` e os slugs de org/projeto no build, que ainda não existem
// (o projeto no Sentry é ação pendente do usuário). Adicioná-lo agora acoplaria o
// build da Vercel a credenciais ausentes, contrariando o requisito de que a
// integração seja inerte sem configuração.
//
// Consequência aceita: stack traces de erro de client virão minificadas até que
// alguém configure o token. Erros de servidor (o caso crítico aqui) não dependem
// de source map. Ao criar o projeto no Sentry, avaliar envolver o config com
// `withSentryConfig` para ganhar as stack traces legíveis.
export default nextConfig;
