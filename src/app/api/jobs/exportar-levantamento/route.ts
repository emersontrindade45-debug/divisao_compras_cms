import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { autorizadoPorCron } from "@/lib/auth/cron";
import { emailDoUsuarioDeSistema } from "@/lib/auth/usuarioSistema";
import { exportarLevantamento, planilhaDoLevantamento } from "@/lib/levantamento/exportarPlanilha";

/**
 * Exporta o levantamento da plataforma para a planilha do Google (M30.d), de hora em hora. Quem a
 * chama é o gatilho do Google (`agendador.gs`), logo depois da verificação de respostas — o plano
 * Hobby da Vercel não aceita um cron a mais.
 *
 * - Proteção: `Authorization: Bearer <CRON_SECRET>`, fail-closed (ver `autorizadoPorCron`).
 * - Auditoria: atribuída ao usuário de sistema (`CRON_USUARIO_EMAIL`); sem ele a rota nega.
 * - Sem `LEVANTAMENTO_PLANILHA_ID` a rota responde 503 e não faz nada.
 * - Pausa mínima de 10 min entre exportações (chamada dobrada não reescreve a planilha).
 * - Divergência entre planilha e cálculo devolve 502, para o gatilho avisar o dono por e-mail.
 * - A resposta leva só contagens e nomes fixos de conferência: nada que tenha vindo de e-mail.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export const PAUSA_MINIMA_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  const inicioEm = Date.now();
  if (!autorizadoPorCron(request)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  if (!planilhaDoLevantamento()) {
    return NextResponse.json({ erro: "A planilha do levantamento não está configurada." }, { status: 503 });
  }

  const email = emailDoUsuarioDeSistema();
  const usuario = email ? await db.user.findUnique({ where: { email }, select: { id: true } }) : null;
  if (!usuario) {
    return NextResponse.json({ erro: "O usuário de sistema não está configurado." }, { status: 503 });
  }

  const recente = await db.auditLog.findFirst({
    where: { acao: "exportar_levantamento_planilha", createdAt: { gte: new Date(inicioEm - PAUSA_MINIMA_MS) } },
    select: { id: true },
  });
  if (recente) return NextResponse.json({ ok: true, pulou: "recente" });

  try {
    const r = await exportarLevantamento(usuario.id);
    const divergentes = r.verificacoes.filter((v) => v.resultado === "DIVERGE").map((v) => v.nome);
    const ok = r.releituraOk && divergentes.length === 0;
    return NextResponse.json({ ok, resumo: r, divergentes }, { status: ok ? 200 : 502 });
  } catch (erro) {
    // Mensagem fixa do nosso código; nunca repassa o texto cru de uma falha externa.
    const msg = erro instanceof Error && /^(LEVANTAMENTO|A leitura)/.test(erro.message) ? erro.message : "A exportação falhou.";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }
}
