import { join } from "node:path";
import { Client } from "pg";
import { NextResponse } from "next/server";
import {
  DDL_TABELA_MIGRATIONS,
  aplicarPendentes,
  calcularPendentes,
  detectarOrfas,
  lerMigrationsLocais,
  type ExecutorSql,
  type RegistroMigration,
} from "@/lib/migrations/aplicar";

// Aplicação de migrations de produção sob demanda (CLAUDE.md §9.7).
// Nunca rodar migrations no build da Vercel — trava o build por conexão de DB
// bloqueada. Esta rota protegida é o canal oficial: chamada manual e explícita.
//
//   GET  /api/admin/migrate  → status (somente leitura)
//   POST /api/admin/migrate  → aplica as pendentes
//
// Proteção: header `Authorization: Bearer <ADMIN_MIGRATE_SECRET>`.
//
// O SQL é executado direto via `pg`, sem o CLI do Prisma: empacotar o CLI numa
// função serverless custou três ciclos de deploy sem nunca funcionar
// (§9.18, §9.26, §9.28, §9.29). `pg` já é dependência direta do projeto.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Migrations exigem DDL e sessão estável, então usam a conexão direta — o mesmo
// alvo que o CLI usava via prisma.config.ts. O pooler (DATABASE_URL) só entra
// como fallback para ambientes onde as duas apontam para o mesmo lugar (dev).
function connectionString(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DIRECT_URL (ou DATABASE_URL) não configurada");
  }
  return url;
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.ADMIN_MIGRATE_SECRET;
  // Sem segredo configurado, a rota fica fechada (fail-closed).
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

const diretorioMigrations = () => join(process.cwd(), "prisma", "migrations");

/** Abre conexão, roda `fn` e garante o fechamento. */
async function comConexao<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: connectionString() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function criarExecutor(client: Client): ExecutorSql {
  return {
    async executar(sql, valores) {
      await client.query(sql, valores as unknown[] | undefined);
    },
    async emTransacao(fn) {
      await client.query("BEGIN");
      try {
        await fn();
        await client.query("COMMIT");
      } catch (erro) {
        await client.query("ROLLBACK");
        throw erro;
      }
    },
  };
}

async function lerRegistros(client: Client): Promise<RegistroMigration[]> {
  // A tabela pode não existir num banco novo — criá-la aqui torna a rota
  // utilizável no primeiro deploy, e o IF NOT EXISTS a mantém idempotente.
  await client.query(DDL_TABELA_MIGRATIONS);
  const { rows } = await client.query<RegistroMigration>(
    `SELECT "migration_name", "finished_at", "rolled_back_at"
       FROM "_prisma_migrations"`,
  );
  return rows;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const locais = lerMigrationsLocais(diretorioMigrations());
    const resultado = await comConexao(async (client) => {
      const registros = await lerRegistros(client);
      return {
        pendentes: calcularPendentes(locais, registros).map((m) => m.nome),
        orfas: detectarOrfas(locais, registros),
        aplicadas: registros
          .filter((r) => r.finished_at !== null && r.rolled_back_at === null)
          .map((r) => r.migration_name)
          .sort(),
      };
    });

    return NextResponse.json({
      comando: "status",
      ...resultado,
      total: locais.length,
      executadoEm: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        comando: "status",
        erro: error instanceof Error ? error.message : String(error),
        executadoEm: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const locais = lerMigrationsLocais(diretorioMigrations());
    const { pendentes, resultados } = await comConexao(async (client) => {
      const registros = await lerRegistros(client);
      const pendentes = calcularPendentes(locais, registros);
      const resultados = await aplicarPendentes(pendentes, criarExecutor(client));
      return { pendentes, resultados };
    });

    const falhou = resultados.some((r) => !r.aplicada);
    return NextResponse.json(
      {
        ok: !falhou,
        comando: "deploy",
        pendentesAntes: pendentes.map((m) => m.nome),
        resultados,
        executadoEm: new Date().toISOString(),
      },
      { status: falhou ? 500 : 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        comando: "deploy",
        erro: error instanceof Error ? error.message : String(error),
        executadoEm: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
