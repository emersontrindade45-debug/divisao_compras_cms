/**
 * Serializa as buscas de vigência de contrato disparadas pelo cliente.
 *
 * Cada card da tabela de candidatos tem seu próprio botão "ver vigência",
 * independente dos outros (`VigenciaContratoCelula`, um `useState` por
 * linha). Sem coordenação, clicar em vários botões em sequência rápida
 * dispara uma varredura pesada no PNCP por clique — cada uma já com
 * concorrência interna de 15 requisições (`LOTE_CONTRATOS` em
 * `lib/integracoes/pncp.ts`) — todas ao mesmo tempo. A soma martela o PNCP
 * além do que ele aguenta e as requisições passam a falhar com
 * ECONNRESET/timeout, estourando o teto de 30s da Server Action: o analista
 * via o toast "Não foi possível consultar os contratos" em todos os cliques.
 *
 * A correção fica no cliente, não no servidor: cada aba do navegador só
 * pode ter uma busca de vigência em voo por vez, e as demais esperam na
 * fila — clicar em "todos em sequência" continua funcionando, só deixa de
 * ser simultâneo.
 */
let filaAtual: Promise<unknown> = Promise.resolve();

export function enfileirarBuscaVigencia<T>(tarefa: () => Promise<T>): Promise<T> {
  const posicao = filaAtual.then(tarefa, tarefa);
  // Nunca deixa uma rejeição travar a fila para as próximas buscas — o erro
  // ainda propaga para quem chamou via `posicao`.
  filaAtual = posicao.catch(() => undefined);
  return posicao;
}
