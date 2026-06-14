import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enviarLembrete } from "@/lib/email";

// Vercel Cron Job — chamado a cada hora via vercel.json
// Localmente: GET /api/jobs/lembretes
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Protect the endpoint when CRON_SECRET is configured
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const now = new Date();

  // Find cotações silenciosas (sem resposta) com dataLimite nos próximos 3 dias
  // e que ainda não tiveram lembrete enviado
  const tresHorasAtras = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const tresDiasAFrente = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const cotacoesPendentes = await db.cotacao.findMany({
    where: {
      status: "silenciosa",
      lembreteEnviado: false,
      dataLimite: {
        gt: tresHorasAtras,
        lte: tresDiasAFrente,
      },
    },
    include: {
      fornecedor: true,
      processo: { select: { numero: true, objeto: true, responsavel: true } },
    },
  });

  const resultados: { cotacaoId: string; fornecedor: string; status: string }[] = [];

  for (const cotacao of cotacoesPendentes) {
    const diasRestantes = Math.ceil(
      (cotacao.dataLimite.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Encontrar e-mail do responsável (fallback para e-mail do sistema)
    const responsavelEmail =
      process.env.EMAIL_RESPONSAVEL ?? "compras@cms.santos.sp.gov.br";

    const result = await enviarLembrete(cotacao.fornecedor.email, {
      fornecedorNome: cotacao.fornecedor.razaoSocial,
      processoNumero: cotacao.processo.numero,
      objeto: cotacao.processo.objeto,
      dataLimite: cotacao.dataLimite,
      diasRestantes,
      responsavelNome: cotacao.processo.responsavel,
      responsavelEmail: responsavelEmail,
    });

    if (result.success) {
      await db.cotacao.update({
        where: { id: cotacao.id },
        data: { lembreteEnviado: true },
      });
      resultados.push({
        cotacaoId: cotacao.id,
        fornecedor: cotacao.fornecedor.razaoSocial,
        status: "enviado",
      });
    } else {
      resultados.push({
        cotacaoId: cotacao.id,
        fornecedor: cotacao.fornecedor.razaoSocial,
        status: `erro: ${result.error}`,
      });
    }
  }

  return NextResponse.json({
    processados: resultados.length,
    resultados,
    executadoEm: now.toISOString(),
  });
}
