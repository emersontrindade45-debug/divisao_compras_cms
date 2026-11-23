/**
 * E-mail do usuário de SISTEMA (`CRON_USUARIO_EMAIL`), a quem a auditoria atribui as ações da
 * verificação automática de respostas. Não é uma pessoa: não deve aparecer onde se escolhe alguém
 * (por exemplo, a lista de responsáveis de um processo).
 *
 * Uma única fonte para a rota do cron e para as listagens, para que elas não divirjam na
 * normalização (minúsculo, sem espaços). `null` = não configurado.
 */
export function emailDoUsuarioDeSistema(): string | null {
  const email = process.env.CRON_USUARIO_EMAIL?.trim().toLowerCase();
  return email ? email : null;
}
