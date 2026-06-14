export interface LembreteEmailData {
  fornecedorNome: string;
  processoNumero: string;
  objeto: string;
  dataLimite: Date;
  diasRestantes: number;
  responsavelNome: string;
  responsavelEmail: string;
}

export function renderLembreteEmail(data: LembreteEmailData): { subject: string; html: string; text: string } {
  const dataLimiteFormatada = data.dataLimite.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const urgencia = data.diasRestantes <= 1 ? "URGENTE — " : "";
  const subject = `${urgencia}Lembrete de Cotação — Processo ${data.processoNumero} | Câmara Municipal de Santos`;

  const alertColor = data.diasRestantes <= 1 ? "#dc2626" : data.diasRestantes <= 3 ? "#d97706" : "#1d4ed8";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#1e3a5f;padding:24px 32px;">
              <p style="margin:0;color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Câmara Municipal de Santos</p>
              <p style="margin:4px 0 0;color:#93c5fd;font-size:14px;">Divisão de Compras</p>
            </td>
          </tr>
          <!-- Alert banner -->
          <tr>
            <td style="background:${alertColor};padding:12px 32px;">
              <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;">
                ⏰ Lembrete: ${data.diasRestantes <= 0 ? "Prazo vencido" : `${data.diasRestantes} dia${data.diasRestantes !== 1 ? "s" : ""} restante${data.diasRestantes !== 1 ? "s" : ""}`}
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;color:#18181b;font-weight:600;">Lembrete de Cotação Pendente</p>
              <p style="margin:0 0 24px;font-size:14px;color:#52525b;line-height:1.6;">
                Prezado(a) <strong>${data.fornecedorNome}</strong>,
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#52525b;line-height:1.6;">
                Identificamos que sua proposta para o processo abaixo ainda não foi recebida.
                Por gentileza, encaminhe-a até a data limite.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:6px;padding:20px;margin-bottom:24px;">
                <tr><td style="padding-bottom:12px;">
                  <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Processo</p>
                  <p style="margin:4px 0 0;font-size:14px;color:#18181b;font-weight:600;">${data.processoNumero}</p>
                </td></tr>
                <tr><td style="padding-bottom:12px;">
                  <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Objeto</p>
                  <p style="margin:4px 0 0;font-size:14px;color:#18181b;">${data.objeto}</p>
                </td></tr>
                <tr><td>
                  <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Prazo Final</p>
                  <p style="margin:4px 0 0;font-size:14px;color:${alertColor};font-weight:600;">${dataLimiteFormatada}</p>
                </td></tr>
              </table>

              <p style="margin:0 0 24px;font-size:14px;color:#52525b;line-height:1.6;">
                Encaminhe a proposta para <a href="mailto:${data.responsavelEmail}" style="color:#1d4ed8;">${data.responsavelEmail}</a>.
              </p>

              <p style="margin:0;font-size:13px;color:#71717a;">
                Caso já tenha enviado sua proposta, desconsidere este lembrete.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f4f4f5;padding:16px 32px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#71717a;text-align:center;">
                Câmara Municipal de Santos — Divisão de Compras<br/>
                Este e-mail foi gerado automaticamente pelo sistema de pesquisa de preços.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `LEMBRETE DE COTAÇÃO — Câmara Municipal de Santos

Prezado(a) ${data.fornecedorNome},

Sua proposta para o processo ${data.processoNumero} ainda não foi recebida.

OBJETO: ${data.objeto}
PRAZO FINAL: ${dataLimiteFormatada}
DIAS RESTANTES: ${data.diasRestantes}

Encaminhe a proposta para: ${data.responsavelEmail}

Caso já tenha enviado, desconsidere este lembrete.

Atenciosamente,
${data.responsavelNome}
Divisão de Compras — Câmara Municipal de Santos`;

  return { subject, html, text };
}
