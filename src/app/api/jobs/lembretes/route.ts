import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Vercel Cron Job — agendado em vercel.json.
// Localmente: GET /api/jobs/lembretes
//
// Proteção: header `Authorization: Bearer <CRON_SECRET>`, que a Vercel envia
// automaticamente às rotas de cron quando a variável existe no projeto.
//
// A guarda é **fail-closed**, no mesmo padrão de /api/admin/migrate. A versão
// anterior era `if (cronSecret && authHeader !== ...)`, que com CRON_SECRET
// ausente curto-circuitava para false e deixava a rota **pública** — foi o que
// aconteceu em produção: `GET https://divisao-compras-cms.vercel.app/api/jobs/lembretes`
// respondia 200 sem cabeçalho nenhum, executando consulta ao banco a cada
// requisição anônima e expondo razão social do fornecedor, número do processo e
// prazos sempre que houvesse cotação vencendo em 3 dias.
//
// Regra geral: guarda de autenticação nunca depende de a configuração existir.
// Configuração ausente fecha a porta, não abre.

// A rota consulta o banco, então nunca pode ser avaliada em build time: sem
// isto o Next tenta coletar dados dela ao construir, instancia o Prisma sem
// `DATABASE_URL` e derruba o build inteiro ("Failed to collect page data").
// Foi o que quebrou o primeiro deploy de preview do projeto — em produção
// passava despercebido porque lá a variável existe.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Sem segredo configurado, a rota fica fechada. */
function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
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
