import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Impede que o bundler (Turbopack/webpack) trace e empacote o CLI do Prisma
  // estaticamente — /api/admin/migrate localiza o CLI em runtime contra
  // node_modules, não pelo grafo de módulos do build.
  serverExternalPackages: ["prisma", "@prisma/client"],
  // A rota /api/admin/migrate executa o CLI do Prisma em runtime (migrate
  // deploy/status). Garante que o binário do Prisma e os arquivos de migration
  // sejam incluídos no bundle da função serverless na Vercel.
  outputFileTracingIncludes: {
    "/api/admin/migrate": [
      "./node_modules/prisma/**",
      "./node_modules/@prisma/engines/**",
      "./prisma/migrations/**",
      "./prisma/schema.prisma",
    ],
  },
};

export default nextConfig;
