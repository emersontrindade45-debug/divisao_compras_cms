/**
 * Critério para a IA aplicar sozinha a classificação de uma resposta de fornecedor (M30.d).
 *
 * Por que NÃO é "confiança alta": em 128 respostas medidas (2026-11-18) o modelo disse "alta" em 126
 * e "média" em 2 — a confiança que ele declara não separa acerto de erro. O critério usa sinais
 * independentes entre si:
 *   1. uma SEGUNDA leitura, de outro modelo, que não viu o veredito da primeira, dá a mesma classe;
 *   2. as duas leituras citam um trecho que de fato existe no texto (barra veredito inventado);
 *   3. a IA não contradiz a regra de palavras — contradição vai para o analista;
 *   4. "orçamento" só com PDF anexado ou texto que diga que o orçamento está sendo enviado;
 *   5. conflito com a frase fixa de recusa também vai para o analista.
 *
 * Função pura: sem banco, sem IA, sem `components/` (CLAUDE.md §9.2). Quem chama monta a entrada.
 */

export type ClasseResposta = "orcamento" | "recusa" | "duvida" | "nao_e_resposta";

export interface LeituraIa {
  classe: ClasseResposta;
  /** O trecho citado existe de fato no texto lido. */
  evidenciaOk: boolean;
}

export interface EntradaCriterio {
  primeira: LeituraIa & { confianca: "alta" | "media" | "baixa" };
  /** Undefined = a revisão não aconteceu (prazo, falha de rede). */
  segunda?: LeituraIa;
  /** Quantos anexos PDF a mensagem trouxe. */
  anexosPdf: number;
  /** O trecho citado fala em ENVIAR orçamento/proposta/cotação (segue, em anexo…). */
  evidenciaDizEnvio: boolean;
  /** Motivo pelo qual a resposta está na fila (o que a regra de palavras disse). */
  motivoFila: string;
  /** A frase fixa de recusa apareceu no texto. */
  contemRecusa: boolean;
}

export type RazaoCriterio =
  | "ok"
  | "sem_revisao"
  | "revisor_discorda"
  | "baixa_confianca"
  | "sem_evidencia"
  | "regra_discorda"
  | "frase_de_recusa_conflita"
  | "orcamento_sem_prova";

export interface ResultadoCriterio {
  ok: boolean;
  razao: RazaoCriterio;
}

/** O que cada motivo "provável" de fila sugere. Os demais motivos não sugerem nada. */
const CLASSE_DO_MOTIVO: Record<string, ClasseResposta | undefined> = {
  provavel_orcamento: "orcamento",
  provavel_recusa: "recusa",
  provavel_duvida: "duvida",
};

export function avaliarCriterioIa(e: EntradaCriterio): ResultadoCriterio {
  const nao = (razao: RazaoCriterio): ResultadoCriterio => ({ ok: false, razao });

  if (!e.segunda) return nao("sem_revisao");
  if (e.segunda.classe !== e.primeira.classe) return nao("revisor_discorda");
  if (e.primeira.confianca === "baixa") return nao("baixa_confianca");
  if (!e.primeira.evidenciaOk || !e.segunda.evidenciaOk) return nao("sem_evidencia");

  const classe = e.primeira.classe;

  // A regra de palavras e a IA são sinais independentes: se divergem, um humano decide. (Nos casos
  // julgados pelo analista em 2026-11-18 a IA acertou 13 de 14, mas o 14º foi justamente uma
  // "provável recusa" que a IA leu como "não é resposta".)
  const sugeridaPelaRegra = CLASSE_DO_MOTIVO[e.motivoFila];
  if (sugeridaPelaRegra !== undefined && sugeridaPelaRegra !== classe) return nao("regra_discorda");

  if (e.contemRecusa && classe !== "recusa") return nao("frase_de_recusa_conflita");

  // Definição do usuário (2026-11-18): orçamento é o corpo que diz estar ENVIANDO ou o anexo em PDF.
  if (classe === "orcamento" && e.anexosPdf === 0 && !e.evidenciaDizEnvio) return nao("orcamento_sem_prova");

  return { ok: true, razao: "ok" };
}
