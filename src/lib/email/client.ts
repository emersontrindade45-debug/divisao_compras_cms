import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  console.warn("[email] RESEND_API_KEY não configurada — e-mails serão simulados");
}

export const resend = new Resend(process.env.RESEND_API_KEY ?? "re_placeholder");

export const EMAIL_FROM = "Divisão de Compras CMS <cotacoes@cms.santos.sp.gov.br>";
