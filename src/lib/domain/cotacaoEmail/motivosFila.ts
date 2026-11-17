/** Rótulos da fila "Respostas a confirmar" (M30.d). */

export const MOTIVO_FILA_LABEL: Record<string, string> = {
  sinais_ambiguos: "Sem sinal claro (nem anexo nem recusa)",
  provavel_recusa: "Provável recusa (frase de recusa fora da lista fixa)",
  provavel_orcamento: "Possível orçamento (\"segue em anexo\", \"valores mantidos\"…)",
  provavel_duvida: "Possível dúvida (o fornecedor faz uma pergunta)",
  sinais_conflitantes: "Anexo e recusa na mesma resposta",
  dominio_generico: "Veio de e-mail pessoal (Gmail, Hotmail…)",
  dominio_ambiguo: "Mais de um fornecedor com esse domínio",
  remetente_desconhecido: "Remetente que não recebeu a solicitação",
};

export function rotuloDoMotivo(motivo: string): string {
  return MOTIVO_FILA_LABEL[motivo] ?? motivo;
}
