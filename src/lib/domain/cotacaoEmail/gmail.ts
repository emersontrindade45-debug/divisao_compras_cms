/**
 * Link para abrir uma mensagem NO PRÓPRIO GMAIL (M30.d). É o que mantém a rastreabilidade sem
 * guardar conteúdo: o sistema só sabe o id opaco da mensagem; quem precisa ler abre a caixa.
 *
 * `authuser` fixa a conta da Divisão — o navegador costuma ter mais de uma conta Google aberta
 * (foi exatamente isso que fez o primeiro teste do script rodar na conta errada).
 */

export const CAIXA_DA_DIVISAO = "divisaocompras@camarasantos.sp.gov.br";

export function linkDoGmail(idMensagem: string): string {
  return (
    `https://mail.google.com/mail/?authuser=${encodeURIComponent(CAIXA_DA_DIVISAO)}` +
    `#all/${encodeURIComponent(idMensagem)}`
  );
}
