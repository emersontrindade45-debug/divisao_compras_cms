import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

function obterCliente(): PrismaClient {
  const existente = globalForPrisma.prisma;
  if (existente) return existente;

  const cliente = createPrismaClient();
  // O singleton vive em `globalThis` em QUALQUER ambiente. Em produção ele não é "hot reload": é o que
  // faz a instância da função serverless reaproveitar UM client (e um conjunto de conexões) entre
  // acessos e entre invocações. A versão anterior só o guardava fora de produção, então cada
  // `db.<model>` em produção criava um PrismaClient novo com pool próprio, nunca encerrado — e o
  // pooler do Supabase respondeu `EMAXCONN (limit: 200)` (2026-11-23), quatro meses depois do defeito
  // nascer, quando a carga por página subiu.
  globalForPrisma.prisma = cliente;
  return cliente;
}

/**
 * Cliente Prisma com conexão preguiçosa.
 *
 * O `Proxy` existe por um motivo concreto, não por elegância: com
 * `export const db = createPrismaClient()`, a conexão era criada ao **avaliar o
 * módulo**. Bastava o Next importar uma rota para coletar metadados durante o
 * build e o `throw` de `DATABASE_URL` ausente derrubava o build inteiro com
 * "Failed to collect page data" — antes de qualquer handler rodar, e sem que
 * `export const dynamic = "force-dynamic"` pudesse evitar (ele impede a
 * execução do handler, não a importação do módulo).
 *
 * O defeito só se manifestava onde a variável não existe: quebrou o primeiro
 * deploy de Preview do projeto e passava despercebido em Production, que é
 * justamente onde ninguém procura. Agora o client nasce no primeiro acesso a
 * um model — em build time ninguém acessa, e a ausência da variável deixa de
 * ser fatal para o empacotamento sem deixar de ser fatal para o uso real.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_alvo, propriedade, receptor) {
    const cliente = obterCliente();
    const valor = Reflect.get(cliente, propriedade, receptor);
    // Métodos do client (`$transaction`, `$connect`, ...) precisam continuar
    // ligados ao client, não ao Proxy vazio.
    return typeof valor === "function" ? valor.bind(cliente) : valor;
  },
});
