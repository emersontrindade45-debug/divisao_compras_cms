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
  /** Anexo em PDF (só PDF conta — o Word/Excel é o modelo que a Divisão envia para preencher). */
  temAnexoOrcamento: boolean;
  contemRecusa: boolean;
  contemValor: boolean;
  /** Frase de recusa fora da lista fixa; ausente no payload do script antigo. */
  provavelRecusa?: boolean;
  /** Corpo que diz estar ENVIANDO o orçamento ("segue orçamento em anexo"); ausente no script antigo. */
  provavelOrcamento?: boolean;
  /** Pergunta do fornecedor; ausente no script antigo. */
  provavelDuvida?: boolean;
}

export type RegraClassificacao = "anexo_orcamento" | "frase_recusa";

export type ResultadoClassificacao =
  | { acao: "devolucao" }
  | { acao: "ignorar"; motivo: "automatica" }
  | { acao: "aplicar"; situacao: "orcamento" | "recusa"; regra: RegraClassificacao }
  | {
      acao: "fila";
      motivo:
        | "sinais_ambiguos"
        | "provavel_recusa"
        | "provavel_orcamento"
        | "provavel_duvida"
        | "anexo_pdf";
    };

export interface OpcoesClassificacao {
  /**
   * O anexo em PDF, sozinho, define "orçamento". Padrão: sim (comportamento histórico). Em 2026-11-18
   * o analista conferiu 11 casos em que a regra dizia "orçamento" por causa de um PDF e a IA, que
   * dizia outra coisa, estava certa nos 11 — PDF anexado não basta (TR devolvido, apresentação da
   * empresa, PDF junto de recusa ou pergunta). Com a aplicação da IA ligada, o PDF passa a ser só um
   * sinal: a resposta vai à fila, e a IA decide (o critério exige o PDF OU o texto que envia).
   */
  pdfDecideSozinho?: boolean;
}

export function classificarResposta(
  m: MarcadoresResposta,
  opcoes: OpcoesClassificacao = {},
): ResultadoClassificacao {
  if (m.devolucao) return { acao: "devolucao" };
  if (m.automatica) return { acao: "ignorar", motivo: "automatica" };

  // Sinais que se contradizem (anexo E recusa, ou recusa citando valor) nunca são aplicados
  // sozinhos: um humano decide.
  const sinalOrcamento = m.temAnexoOrcamento;
  const sinalRecusa = m.contemRecusa;

  if (sinalOrcamento && !sinalRecusa) {
    if (opcoes.pdfDecideSozinho === false) return { acao: "fila", motivo: "anexo_pdf" };
    return { acao: "aplicar", situacao: "orcamento", regra: "anexo_orcamento" };
  }
  if (sinalRecusa && !sinalOrcamento && !m.contemValor) {
    return { acao: "aplicar", situacao: "recusa", regra: "frase_recusa" };
  }
  // Orçamento E recusa prováveis na mesma resposta se contradizem: ninguém é sugerido, decide um
  // humano (é a mesma regra do anexo + frase de recusa acima).
  if (m.provavelRecusa && m.provavelOrcamento) return { acao: "fila", motivo: "sinais_ambiguos" };

  // Recusa em frase que a lista fixa não conhece. Só SUGERE: a precisão foi medida numa amostra
  // pequena (30 respostas), então a decisão continua humana, mas agrupada para resolver em lote.
  if (m.provavelRecusa && !sinalOrcamento && !m.contemValor) {
    return { acao: "fila", motivo: "provavel_recusa" };
  }
  // Sugestões que só ajudam a triar a fila (nunca aplicam). Precedência: orçamento > recusa >
  // dúvida — quem entrega orçamento e pergunta algo continua sendo orçamento.
  if (m.provavelOrcamento && !sinalRecusa) return { acao: "fila", motivo: "provavel_orcamento" };
  if (m.provavelDuvida && !sinalOrcamento && !sinalRecusa) {
    return { acao: "fila", motivo: "provavel_duvida" };
  }
  return { acao: "fila", motivo: "sinais_ambiguos" };
}
