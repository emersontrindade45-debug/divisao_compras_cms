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
  // Com pnpm, as dependências do CLI do Prisma (@prisma/engines e companhia) são
  // transitivas: só existem sob .pnpm/<pkg>@<versão>[_hash]/node_modules e não
  // ganham symlink em node_modules/@prisma. O bundle da Vercel não recria esses
  // symlinks, então copiar os arquivos não basta — a rota também exporta
  // NODE_PATH com esses diretórios para o subprocesso do CLI (ver route.ts).
  // Os globs cobrem `prisma@*` e `@prisma+*` porque o sufixo de hash de
  // peer-deps no nome do diretório não é previsível.
  outputFileTracingIncludes: {
    "/api/admin/migrate": [
      "./node_modules/prisma/**",
      "./node_modules/.pnpm/prisma@*/node_modules/**",
      "./node_modules/.pnpm/@prisma+*/node_modules/**",
      "./prisma/migrations/**",
      "./prisma/schema.prisma",
    ],
  },
};

export default nextConfig;
