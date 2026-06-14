import "server-only";
import { resend, EMAIL_FROM } from "./client";
import { renderCotacaoEmail, type CotacaoEmailData } from "./templates/cotacao";
import { renderLembreteEmail, type LembreteEmailData } from "./templates/lembrete";

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function enviarCotacao(
  para: string,
  data: CotacaoEmailData,
): Promise<EmailResult> {
  const { subject, html, text } = renderCotacaoEmail(data);

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: para,
      subject,
      html,
      text,
    });

    if (result.error) {
      console.error("[email] Erro ao enviar cotação:", result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true, messageId: result.data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[email] Exceção ao enviar cotação:", message);
    return { success: false, error: message };
  }
}

export async function enviarLembrete(
  para: string,
  data: LembreteEmailData,
): Promise<EmailResult> {
  const { subject, html, text } = renderLembreteEmail(data);

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: para,
      subject,
      html,
      text,
    });

    if (result.error) {
      console.error("[email] Erro ao enviar lembrete:", result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true, messageId: result.data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[email] Exceção ao enviar lembrete:", message);
    return { success: false, error: message };
  }
}
