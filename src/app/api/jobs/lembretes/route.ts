import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Vercel Cron Job — chamado a cada hora via vercel.json
// Localmente: GET /api/jobs/lembretes
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const now = new Date();
  const tresDiasAFrente = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const cotacoesPendentes = await db.cotacao.findMany({
    where: {
      status: "silenciosa",
      dataLimite: { gt: now, lte: tresDiasAFrente },
    },
    include: {
      fornecedor: { select: { razaoSocial: true } },
      processo: { select: { numero: true, objeto: true } },
    },
  });

  return NextResponse.json({
    pendentes: cotacoesPendentes.map((c) => ({
      cotacaoId: c.id,
      fornecedor: c.fornecedor.razaoSocial,
      processoNumero: c.processo.numero,
      dataLimite: c.dataLimite.toISOString(),
    })),
    executadoEm: now.toISOString(),
  });
}
