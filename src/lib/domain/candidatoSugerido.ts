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

export interface ResultadoSugestaoCandidatos {
  cnaesSugeridos: string[];
  candidatos: CandidatoSugerido[];
  /** Quantos casaram com os CNAEs antes de aplicar o teto — para a UI dizer que houve corte. */
  totalEncontrado: number;
  /** Quantos dos devolvidos são da Baixada Santista — a UI avisa quando a busca sai da região. */
  locais: number;
}
