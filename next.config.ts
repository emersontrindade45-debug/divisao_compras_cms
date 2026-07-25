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
  // Com pnpm, as dependências do CLI do Prisma são transitivas: só existem sob
  // .pnpm/<pkg>@<versão>[_hash]/node_modules e não ganham symlink em
  // node_modules/@prisma. O bundle da Vercel não recria esses symlinks, então
  // copiar os arquivos não basta — a rota também exporta NODE_PATH com esses
  // diretórios para o subprocesso do CLI (ver route.ts).
  //
  // Os globs são deliberadamente estreitos: `@prisma+*` genérico arrasta
  // @prisma/client (85 MB), studio-core (38 MB) e @prisma/dev (15 MB) — 228 MB
  // numa única função, o que faz o deploy falhar em "Deploying outputs...".
  // Só entram os pacotes que `migrate deploy/status` realmente carrega.
  // O `*` final em cada padrão cobre o sufixo de hash de peer-deps, que não é
  // previsível; o engine binário do schema fica em @prisma+engines.
  outputFileTracingIncludes: {
    "/api/admin/migrate": [
      "./node_modules/prisma/**",
      "./node_modules/.pnpm/prisma@*/node_modules/prisma/**",
      "./node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines/**",
      "./node_modules/.pnpm/@prisma+engines-version@*/node_modules/@prisma/engines-version/**",
      "./node_modules/.pnpm/@prisma+get-platform@*/node_modules/@prisma/get-platform/**",
      "./node_modules/.pnpm/@prisma+fetch-engine@*/node_modules/@prisma/fetch-engine/**",
      "./node_modules/.pnpm/@prisma+debug@*/node_modules/@prisma/debug/**",
      "./node_modules/.pnpm/@prisma+config@*/node_modules/@prisma/config/**",
      "./prisma/migrations/**",
      "./prisma/schema.prisma",
    ],
  },
};

export default nextConfig;
