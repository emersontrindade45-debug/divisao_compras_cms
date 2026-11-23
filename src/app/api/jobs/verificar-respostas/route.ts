import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { autorizadoPorCron } from "@/lib/auth/cron";
import { executarVerificacao } from "@/lib/emailCotacao/verificar";

/**
 * Verificação AUTOMÁTICA de respostas (M30.d): faz o mesmo que o botão "Verificar respostas", sem
 * ninguém logado. Quem a chama de hora em hora é o gatilho do Google (`agendador.gs`): o plano
 * Hobby da Vercel não aceita cron mais frequente que uma vez por dia.
 *
 * - Proteção: `Authorization: Bearer <CRON_SECRET>`, fail-closed (ver `autorizadoPorCron`).
 * - Quem consta na auditoria: o usuário de sistema apontado por `CRON_USUARIO_EMAIL`. Sem ele a rota
 *   nega — nunca atribui a ação a uma pessoa real por falta de configuração.
 * - Pausa mínima: se houve uma verificação nos últimos 10 min (manual ou automática), não repete.
 * - Custo de IA: só respostas SEM veredito vão ao modelo (as já classificadas são puladas), então uma
 *   rodada sem e-mail novo não gasta token nenhum.
 * - A resposta leva só contagens ou texto fixo: nada que tenha vindo do e-mail.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Teto do plano Hobby; o miolo já reparte esse tempo entre Google, banco e IA. */
export const maxDuration = 60;

export const PAUSA_MINIMA_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  const inicioEm = Date.now();
  if (!autorizadoPorCron(request)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const email = process.env.CRON_USUARIO_EMAIL?.trim().toLowerCase();
  const usuario = email ? await db.user.findUnique({ where: { email }, select: { id: true } }) : null;
  if (!usuario) {
    return NextResponse.json({ erro: "O usuário de sistema da verificação automática não está configurado." }, { status: 503 });
  }

  const recente = await db.auditLog.findFirst({
    where: { acao: "verificar_respostas_email", createdAt: { gte: new Date(inicioEm - PAUSA_MINIMA_MS) } },
    select: { id: true },
  });
  if (recente) return NextResponse.json({ ok: true, pulou: "recente" });

  const r = await executarVerificacao({ userId: usuario.id, inicioEm, origem: "automatica" });
  if (r.error || !r.data) {
    return NextResponse.json({ erro: r.error ?? "A verificação não terminou." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, resumo: r.data });
}
