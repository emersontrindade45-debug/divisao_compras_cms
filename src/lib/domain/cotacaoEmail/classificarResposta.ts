/**
 * Classificação determinística de uma resposta de fornecedor (M30.d, decisões Q25/Q27).
 *
 * Só olha marcadores booleanos que o script do Google calculou DENTRO do Google — nenhum texto de
 * e-mail chega aqui. Regras locais, sem IA externa. O que nenhuma regra decide com segurança vai
 * para a fila "a confirmar". O VALOR do orçamento nunca entra na série de preços por aqui: a
 * proposta segue pelo checklist de validade.
 */

export interface MarcadoresResposta {
  devolucao: boolean;
  automatica: boolean;
  temAnexoOrcamento: boolean;
  contemRecusa: boolean;
  contemValor: boolean;
  /** Frase de recusa fora da lista fixa; ausente no payload do script antigo. */
  provavelRecusa?: boolean;
}

export type RegraClassificacao = "anexo_orcamento" | "frase_recusa";

export type ResultadoClassificacao =
  | { acao: "devolucao" }
  | { acao: "ignorar"; motivo: "automatica" }
  | { acao: "aplicar"; situacao: "orcamento" | "recusa"; regra: RegraClassificacao }
  | { acao: "fila"; motivo: "sinais_ambiguos" | "provavel_recusa" };

export function classificarResposta(m: MarcadoresResposta): ResultadoClassificacao {
  if (m.devolucao) return { acao: "devolucao" };
  if (m.automatica) return { acao: "ignorar", motivo: "automatica" };

  // Sinais que se contradizem (anexo E recusa, ou recusa citando valor) nunca são aplicados
  // sozinhos: um humano decide.
  const sinalOrcamento = m.temAnexoOrcamento;
  const sinalRecusa = m.contemRecusa;

  if (sinalOrcamento && !sinalRecusa) {
    return { acao: "aplicar", situacao: "orcamento", regra: "anexo_orcamento" };
  }
  if (sinalRecusa && !sinalOrcamento && !m.contemValor) {
    return { acao: "aplicar", situacao: "recusa", regra: "frase_recusa" };
  }
  // Recusa em frase que a lista fixa não conhece. Só SUGERE: a precisão foi medida numa amostra
  // pequena (30 respostas), então a decisão continua humana, mas agrupada para resolver em lote.
  if (m.provavelRecusa && !sinalOrcamento && !m.contemValor) {
    return { acao: "fila", motivo: "provavel_recusa" };
  }
  return { acao: "fila", motivo: "sinais_ambiguos" };
}
