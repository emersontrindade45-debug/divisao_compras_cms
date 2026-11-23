import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auth/audit";
import { payloadScriptSchema } from "@/lib/emailCotacao/payload";
import { sincronizarRespostasEmail, type ResumoSincronizacao } from "@/lib/emailCotacao/sincronizar";

/**
 * Miolo da verificação de respostas (M30.d): lê a caixa da Divisão pelo script do Google e atualiza as
 * cotações. Existe fora da Server Action para que a execução AUTOMÁTICA (rota de cron) percorra
 * exatamente o mesmo caminho que o botão "Verificar respostas" — mesma validação estrita do payload,
 * mesmo prazo, mesma auditoria. Quem chama decide QUEM é o usuário (login ou usuário de sistema).
 *
 * SIGILO (decidido com o usuário):
 * - O script roda dentro do Google e devolve só metadados e marcadores booleanos; o payload é
 *   validado em modo estrito (campo de conteúdo = leitura rejeitada).
 * - NADA que tenha vindo do payload sai nas mensagens de erro: toda falha vira texto fixo, para
 *   a exceção não levar trechos do e-mail ao Sentry nem à tela.
 * - Sem `APPS_SCRIPT_URL`/`APPS_SCRIPT_SEGREDO` configurados, nega (fail-closed, §9.45).
 *
 * Só lê e registra: não envia e-mail nenhum (CLAUDE.md §9.3).
 */

/**
 * A leitura de 30 dias levava ~12 s no Google e, com o texto e o contexto para a IA, 39,5 s (medido
 * em 2026-11-18). O que passar disso reduz o tempo da IA (ver `LIMITE_FUNCAO_MS`), não derruba a função.
 */
const TIMEOUT_SCRIPT_MS = 48_000;
export const JANELA_DIAS = 30;

/** Fatia do histórico: começa `desdeDias` atrás e cobre `dias` (limites espelham o script). */
export const janelaSchema = z.object({
  desdeDias: z.number().int().min(0).max(1500),
  dias: z.number().int().min(1).max(90),
});
export type JanelaLeitura = z.infer<typeof janelaSchema>;

/** `fiosTruncados`: a fatia tinha mais fios que o teto da leitura — falta ler parte dela. */
export type ResumoLeitura = ResumoSincronizacao & { fiosTruncados?: boolean };

export type ResultadoVerificacao = { data?: ResumoLeitura; error?: string };

export interface OpcoesVerificacao {
  userId: string;
  processoId?: string;
  janela?: JanelaLeitura;
  /** Instante em que a ação começou (a IA usa só o que sobrar dos 60 s da função). */
  inicioEm: number;
  /** Marca a execução na auditoria. Só "automatica" é gravada; a manual segue como sempre foi. */
  origem?: "manual" | "automatica";
}

export async function executarVerificacao(o: OpcoesVerificacao): Promise<ResultadoVerificacao> {
  const { userId, processoId, janela, inicioEm } = o;

  const url = process.env.APPS_SCRIPT_URL;
  const segredo = process.env.APPS_SCRIPT_SEGREDO;
  if (!url || !segredo) {
    return { error: "A leitura de e-mails ainda não foi configurada neste ambiente." };
  }

  let corpo: unknown;
  const googleIniciou = Date.now();
  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        janela
          ? { segredo, dias: janela.dias, desdeDias: janela.desdeDias }
          : { segredo, dias: JANELA_DIAS },
      ),
      signal: AbortSignal.timeout(TIMEOUT_SCRIPT_MS),
      cache: "no-store",
    });
    if (!resposta.ok) return { error: "O Google recusou a leitura. Tente novamente em instantes." };
    corpo = await resposta.json();
  } catch {
    return { error: "Não foi possível ler os e-mails agora. Tente novamente em instantes." };
  }

  const payload = payloadScriptSchema.safeParse(corpo);
  if (!payload.success) {
    // Não detalhar: `payload.error` pode citar o que veio. A causa mais comum é o segredo errado.
    return { error: "A resposta do script de e-mail não tem o formato esperado." };
  }

  const googleMs = Date.now() - googleIniciou;
  try {
    const sincronizarIniciou = Date.now();
    const resumo = await sincronizarRespostasEmail(payload.data, { processoId, inicioEm, userId });
    const sincronizarMs = Date.now() - sincronizarIniciou;

    await registrarAuditoria({
      userId,
      acao: "verificar_respostas_email",
      processoId,
      // Só contagens — nenhum endereço, id de mensagem ou texto.
      // Tempo por etapa: sem isto, um 504 não diz se foi o Google, o banco ou a IA (CLAUDE.md §9.127).
      detalhes: {
        ...resumo,
        googleMs,
        sincronizarMs,
        totalMs: Date.now() - inicioEm,
        ...(o.origem === "automatica" ? { origem: "automatica" } : {}),
      },
    });

    revalidatePath("/cotacoes");
    revalidatePath("/dashboard");
    if (processoId) revalidatePath(`/processos/${processoId}`);

    const truncado = payload.data.diagnostico?.fiosTruncados === true;
    return { data: truncado ? { ...resumo, fiosTruncados: true } : resumo };
  } catch {
    return { error: "As respostas foram lidas, mas não foi possível gravá-las. Tente novamente." };
  }
}
