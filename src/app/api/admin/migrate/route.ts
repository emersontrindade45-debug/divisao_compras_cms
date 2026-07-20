import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Rota protegida para aplicar migrations pendentes sem precisar de acesso local.
// Requer o header: Authorization: Bearer <CRON_SECRET>
// Uso: POST https://seu-app.vercel.app/api/admin/migrate
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const { stdout, stderr } = await execAsync("npx prisma migrate deploy", {
      env: { ...process.env },
      timeout: 60_000,
    });

    return NextResponse.json({
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim() || null,
    });
  } catch (err) {
    const e = err as { message?: string; stdout?: string; stderr?: string };
    return NextResponse.json(
      {
        ok: false,
        error: e.message ?? "Falha ao executar migrate deploy.",
        stdout: e.stdout?.trim() ?? null,
        stderr: e.stderr?.trim() ?? null,
      },
      { status: 500 },
    );
  }
}
