import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { autorizadoPorCron } from "@/lib/auth/cron";
import { emailDoUsuarioDeSistema } from "@/lib/auth/usuarioSistema";
import { coletarExemplos } from "@/lib/emailCotacao/exemplosIa";

/**
 * Coleta dos exemplos anonimizados da IA (M30.d), de hora em hora: busca no script do Google o trecho
 * dos casos que a Divisão decidiu ou conferiu e ainda não têm exemplo. Quem a chama é o gatilho do
 * Google (`agendador.gs`), depois da verificação e da exportação.
 *
 * - Proteção: `Authorization: Bearer <CRON_SECRET>`, fail-closed (ver `autorizadoPorCron`).
 * - Auditoria atribuída ao usuário de sistema (`CRON_USUARIO_EMAIL`); sem ele a rota nega.
 * - Até 30 casos por rodada; rodada sem caso novo não chama o Google.
 * - A resposta leva só contagens: nada que tenha vindo de e-mail.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!autorizadoPorCron(request)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  const email = emailDoUsuarioDeSistema();
  const usuario = email ? await db.user.findUnique({ where: { email }, select: { id: true } }) : null;
  if (!usuario) {
    return NextResponse.json({ erro: "O usuário de sistema não está configurado." }, { status: 503 });
  }

  const r = await coletarExemplos();
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 });

  // Rodada sem nada novo não enche a auditoria (24 linhas por dia sem informação).
  if (r.resultado.pedidos > 0 || r.resultado.atualizados > 0) {
    await db.auditLog.create({
      data: { userId: usuario.id, acao: "coletar_exemplos_ia", detalhes: { origem: "automatica", ...r.resultado } },
    });
  }
  return NextResponse.json({ ok: true, resumo: r.resultado });
}
