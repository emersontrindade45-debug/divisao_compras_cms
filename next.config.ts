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

export default nextConfig;
