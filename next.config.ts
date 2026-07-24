import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
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
