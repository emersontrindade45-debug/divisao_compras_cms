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
}
