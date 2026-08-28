/**
 * Tipos e constantes da sugestão de candidatos para cotação.
 *
 * Vivem fora da server action porque um módulo `"use server"` só pode exportar funções async — o
 * Next descarta o módulo inteiro se houver export de constante, tipo ou interface, e o sintoma é um
 * "module has no exports at all" no build, não um erro na linha culpada.
 */

/** Teto de candidatos devolvidos por sugestão (decisão do usuário, 2026-08-22). */
export const TETO_CANDIDATOS = 500;

export interface CandidatoSugerido {
  id: string;
  cnpj: string;
  razaoSocial: string;
  email: string;
  municipio: string;
  estado: string;
  cnaePrincipalCodigo: string;
  cnaePrincipalDescricao: string;
  /** true quando outra empresa usa o mesmo e-mail — tipicamente escritório de contabilidade. */
  emailCompartilhado: boolean;
  /** true = habilitada a licitar no SICAF (compras.gov.br) — já participa de licitação federal. */
  sicafHabilitado: boolean;
}

/**
 * Recorte geográfico da busca de candidatos. A Baixada Santista sai separada do resto de SP porque
 * é a região da Câmara e tem significado operacional próprio (fornecedor local responde mais e
 * atende serviço presencial) — não é só mais uma fatia do estado.
 */
export const REGIOES_BUSCA = [
  { valor: "baixada", rotulo: "Baixada Santista", estado: "SP" },
  { valor: "sp_demais", rotulo: "Demais cidades de SP", estado: "SP" },
  { valor: "MG", rotulo: "Minas Gerais", estado: "MG" },
  { valor: "RJ", rotulo: "Rio de Janeiro", estado: "RJ" },
  { valor: "ES", rotulo: "Espírito Santo", estado: "ES" },
] as const;

export type RegiaoBuscaCandidatos = (typeof REGIOES_BUSCA)[number]["valor"];

export interface FiltrosBuscaCandidatos {
  /** Regiões a incluir. Vazio ou ausente = todas (comportamento anterior à expansão do Sudeste). */
  regioes?: RegiaoBuscaCandidatos[];
  /** true = devolve apenas empresas habilitadas no SICAF. Opcional, nunca o padrão: no recorte
   *  medido (telecom/SP, 2026-08-28) só 3,4% das empresas com e-mail estão no SICAF, e 2,6% na
   *  Baixada — como filtro fixo, esconderia a grande maioria dos fornecedores aptos. */
  somenteSicaf?: boolean;
}

/** Um CNAE proposto pela IA, com o volume de empresas por trás — o dado que permite ao analista
 *  julgar se aquele código faz sentido antes de gastar a busca. */
export interface CnaeSugerido {
  codigo: string;
  descricao: string;
  /** Empresas com e-mail em SP nesse CNAE. */
  empresas: number;
  /** Quantas delas na Baixada Santista. */
  locais: number;
  /** `false` quando o analista acrescentou o código à mão, em vez de a IA tê-lo proposto. */
  daIa: boolean;
}

export interface ResultadoCnaesSugeridos {
  cnaes: CnaeSugerido[];
}

export interface ResultadoSugestaoCandidatos {
  cnaesSugeridos: string[];
  candidatos: CandidatoSugerido[];
  /** Quantos casaram com os CNAEs antes de aplicar o teto — para a UI dizer que houve corte. */
  totalEncontrado: number;
  /** Quantos dos devolvidos são da Baixada Santista — a UI avisa quando a busca sai da região. */
  locais: number;
  /** Quantos dos devolvidos estão no SICAF. */
  noSicaf: number;
  /**
   * Quantas empresas o filtro `somenteSicaf` deixou de fora — medido no banco com o mesmo recorte,
   * sem o filtro. Existe para a tela dizer o CUSTO do filtro ("21 no SICAF; 778 ocultadas") em vez
   * de só devolver uma lista curta sem explicação: sem esse número, o analista não tem como saber
   * se a busca rendeu pouco ou se foi ele mesmo que estreitou demais. `null` quando o filtro está
   * desligado (nada foi ocultado).
   */
  ocultadosPorSicaf: number | null;
}
