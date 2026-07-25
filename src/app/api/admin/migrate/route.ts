import { existsSync, readdirSync } from "node:fs";
import { delimiter, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

// Aplicação de migrations de produção sob demanda (CLAUDE.md §9.7).
// Nunca rodar migrations no build da Vercel — trava o build por conexão de DB
// bloqueada. Esta rota protegida é o canal oficial: chamada manual e explícita.
//
//   GET  /api/admin/migrate  → prisma migrate status  (somente leitura)
//   POST /api/admin/migrate  → prisma migrate deploy   (aplica pendentes)
//
// Proteção: header `Authorization: Bearer <ADMIN_MIGRATE_SECRET>`.
// Runtime Node (o CLI do Prisma não roda em edge) e sempre dinâmica.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

// Resolve o CLI do Prisma dentro de node_modules e o executa com o mesmo Node
// do processo — evita depender de `npx`/`pnpm` estarem no PATH em runtime.
//
// Usa path.join, não require.resolve: o Turbopack traça require.resolve()
// estaticamente (mesmo sob createRequire) e segue os requires internos do CLI
// até o @prisma/dev, quebrando o build nos assets .wasm/.tar.gz dele —
// serverExternalPackages não evita (vercel/next.js#65828).
// O alvo é "build/index.js" porque em prisma@7.8.0 o export "." aponta para
// "build/types.js", que não existe no pacote publicado.
function resolvePrismaCli(): string {
  const cli = join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  if (!existsSync(cli)) {
    throw new Error(`CLI do Prisma não encontrado em ${cli}`);
  }
  return cli;
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.ADMIN_MIGRATE_SECRET;
  // Sem segredo configurado, a rota fica fechada (fail-closed).
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// O CLI faz `require("@prisma/engines")` — resolução por nome, que sobe a
// árvore de node_modules. Com pnpm, @prisma/engines é dependência transitiva e
// só existe sob .pnpm/<pkg>@<versão>[_hash]/node_modules; o bundle da Vercel
// não recria os symlinks, então /var/task/node_modules/@prisma/ tem apenas as
// dependências diretas (client, adapter-pg) e o require falha.
// Incluir os arquivos via outputFileTracingIncludes não basta: eles chegam num
// caminho que o algoritmo de resolução do Node nunca consulta. NODE_PATH torna
// esses diretórios pesquisáveis. Descoberto em runtime (readdirSync) porque o
// sufixo de hash de peer-deps no nome do diretório não é previsível.
function pnpmModulePaths(): string[] {
  const pnpmDir = join(process.cwd(), "node_modules", ".pnpm");
  if (!existsSync(pnpmDir)) return [];
  try {
    return readdirSync(pnpmDir)
      .filter((entry) => entry.startsWith("@prisma+") || entry.startsWith("prisma@"))
      .map((entry) => join(pnpmDir, entry, "node_modules"))
      .filter((dir) => existsSync(dir));
  } catch {
    return [];
  }
}

async function runPrisma(args: string[]) {
  const cli = resolvePrismaCli();
  const nodePath = [...pnpmModulePaths(), process.env.NODE_PATH]
    .filter(Boolean)
    .join(delimiter);
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [cli, ...args],
    {
      env: { ...process.env, NODE_PATH: nodePath },
      // Migrations grandes podem demorar; teto generoso mas finito.
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  return { stdout, stderr };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { stdout, stderr } = await runPrisma(["migrate", "status"]);
    return NextResponse.json({
      comando: "migrate status",
      stdout,
      stderr,
      executadoEm: new Date().toISOString(),
    });
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    // `migrate status` sai com código ≠ 0 quando há migrations pendentes —
    // isso é informação, não falha da rota.
    return NextResponse.json(
      {
        comando: "migrate status",
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? err.message ?? "",
        executadoEm: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { stdout, stderr } = await runPrisma(["migrate", "deploy"]);
    return NextResponse.json({
      ok: true,
      comando: "migrate deploy",
      stdout,
      stderr,
      executadoEm: new Date().toISOString(),
    });
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return NextResponse.json(
      {
        ok: false,
        comando: "migrate deploy",
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? err.message ?? "",
        executadoEm: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
