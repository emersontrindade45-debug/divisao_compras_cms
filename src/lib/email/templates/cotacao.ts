export interface CotacaoEmailData {
  fornecedorNome: string;
  processoNumero: string;
  objeto: string;
  unidade: string;
  quantidade: number;
  caracteristicasTecnicas: string;
  dataLimite: Date;
  responsavelNome: string;
  responsavelEmail: string;
  appUrl: string;
}

export function renderCotacaoEmail(data: CotacaoEmailData): { subject: string; html: string; text: string } {
  const dataLimiteFormatada = data.dataLimite.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const subject = `Solicitação de Cotação — Processo ${data.processoNumero} | Câmara Municipal de Santos`;

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
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;color:#18181b;font-weight:600;">Solicitação de Cotação de Preço</p>
              <p style="margin:0 0 24px;font-size:14px;color:#52525b;line-height:1.6;">
                Prezado(a) <strong>${data.fornecedorNome}</strong>,
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#52525b;line-height:1.6;">
                A Câmara Municipal de Santos solicita cotação de preço para o item descrito abaixo,
                em conformidade com a IN SEGES/ME nº 65/2021. Por favor, encaminhe sua proposta
                até a data limite indicada.
              </p>

              <!-- Item box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:6px;padding:20px;margin-bottom:24px;">
                <tr><td style="padding-bottom:12px;">
                  <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Processo</p>
                  <p style="margin:4px 0 0;font-size:14px;color:#18181b;font-weight:600;">${data.processoNumero}</p>
                </td></tr>
                <tr><td style="padding-bottom:12px;">
                  <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Objeto</p>
                  <p style="margin:4px 0 0;font-size:14px;color:#18181b;">${data.objeto}</p>
                </td></tr>
                <tr><td style="padding-bottom:12px;">
                  <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Quantidade</p>
                  <p style="margin:4px 0 0;font-size:14px;color:#18181b;">${data.quantidade} ${data.unidade}</p>
                </td></tr>
                <tr><td style="padding-bottom:12px;">
                  <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Características Técnicas</p>
                  <p style="margin:4px 0 0;font-size:14px;color:#18181b;">${data.caracteristicasTecnicas}</p>
                </td></tr>
                <tr><td>
                  <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Prazo para Envio da Proposta</p>
                  <p style="margin:4px 0 0;font-size:14px;color:#dc2626;font-weight:600;">${dataLimiteFormatada}</p>
                </td></tr>
              </table>

              <!-- Instructions -->
              <p style="margin:0 0 8px;font-size:14px;color:#18181b;font-weight:600;">Instruções para a Proposta</p>
              <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#52525b;line-height:1.8;">
                <li>Informar CNPJ, razão social e data de validade da proposta.</li>
                <li>Indicar o valor unitário e o valor total para a quantidade solicitada.</li>
                <li>Identificar o responsável pela proposta (nome e assinatura).</li>
                <li>Descrição do objeto deve corresponder ao solicitado.</li>
              </ul>

              <p style="margin:0 0 24px;font-size:14px;color:#52525b;line-height:1.6;">
                Encaminhe a proposta por e-mail para <a href="mailto:${data.responsavelEmail}" style="color:#1d4ed8;">${data.responsavelEmail}</a>
                ou responda a esta mensagem.
              </p>

              <p style="margin:0;font-size:14px;color:#52525b;">
                Qualquer dúvida, entre em contato com <strong>${data.responsavelNome}</strong>.
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

  const text = `SOLICITAÇÃO DE COTAÇÃO — Câmara Municipal de Santos

Prezado(a) ${data.fornecedorNome},

A Câmara Municipal de Santos solicita cotação de preço para o item abaixo.

PROCESSO: ${data.processoNumero}
OBJETO: ${data.objeto}
QUANTIDADE: ${data.quantidade} ${data.unidade}
CARACTERÍSTICAS: ${data.caracteristicasTecnicas}
PRAZO: ${dataLimiteFormatada}

Encaminhe a proposta para: ${data.responsavelEmail}

Atenciosamente,
${data.responsavelNome}
Divisão de Compras — Câmara Municipal de Santos`;

  return { subject, html, text };
}
