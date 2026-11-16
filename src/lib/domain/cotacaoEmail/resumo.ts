/** Texto do resultado de "Verificar respostas" (M30.d), para o aviso na tela. */

export interface ResumoVerificacao {
  envios: number;
  enviosNovos: number;
  consultasNovas: number;
  respostasClassificadas: number;
  respostasNaFila: number;
  emailsInvalidos: number;
  enviosSemProcesso: number;
}

function n(qtd: number, singular: string, plural: string): string {
  return `${qtd.toLocaleString("pt-BR")} ${qtd === 1 ? singular : plural}`;
}

export function resumirVerificacao(r: ResumoVerificacao): string {
  const partes: string[] = [];
  if (r.enviosNovos > 0) partes.push(`${n(r.enviosNovos, "envio novo", "envios novos")}`);
  if (r.consultasNovas > 0) partes.push(`${n(r.consultasNovas, "fornecedor consultado", "fornecedores consultados")}`);
  if (r.respostasClassificadas > 0) partes.push(`${n(r.respostasClassificadas, "resposta classificada", "respostas classificadas")}`);
  if (r.respostasNaFila > 0) partes.push(`${n(r.respostasNaFila, "resposta a confirmar", "respostas a confirmar")}`);
  if (r.emailsInvalidos > 0) partes.push(`${n(r.emailsInvalidos, "e-mail inválido novo", "e-mails inválidos novos")}`);
  return partes.length > 0
    ? `E-mails lidos: ${partes.join(", ")}.`
    : "E-mails lidos: nada novo desde a última verificação.";
}
