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
  // Com pnpm, @prisma/engines é dependência do pacote `prisma` (não do projeto)
  // e só existe no store isolado — node_modules/@prisma/engines não existe, então
  // um glob apontando para lá não copia nada e o CLI quebra em runtime com
  // "Cannot find module '@prisma/engines'". Incluir os caminhos reais do .pnpm.
  outputFileTracingIncludes: {
    "/api/admin/migrate": [
      "./node_modules/prisma/**",
      "./node_modules/.pnpm/prisma@*/node_modules/prisma/**",
      "./node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines/**",
      "./node_modules/.pnpm/@prisma+engines-version@*/node_modules/@prisma/engines-version/**",
      "./prisma/migrations/**",
      "./prisma/schema.prisma",
    ],
  },
};

export default nextConfig;
