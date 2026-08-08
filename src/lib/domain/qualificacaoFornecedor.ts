import type { DomainResult, Violation } from "./types";

/**
 * Regra de negócio da qualificação de fornecedor (M19): decide o status de
 * qualificação a partir da situação cadastral de CNPJ.
 *
 * Puro quanto a I/O — não faz fetch nem toca no Prisma; recebe o resultado já
 * obtido pelo cliente de `lib/integracoes/` (CLAUDE.md §2, domínio separado de
 * integração).
 */

export type StatusQualificacao = "regular" | "sancionado" | "cadastro_irregular" | "nao_verificado";

export interface EntradaQualificacao {
  situacaoCadastral: string | null;
}

export interface ResultadoQualificacao {
  status: StatusQualificacao;
  alerta: boolean;
  mensagem: string;
}

// Situações da Receita Federal que não são "ATIVA" — a lista não é exaustiva
// (a Receita tem mais estados), mas cobre os casos que a IN 65/2021 mais
// precisa sinalizar. Comparação case-insensitive porque a BrasilAPI devolve
// o texto em maiúsculas, mas não há garantia contratual disso.
const SITUACOES_IRREGULARES = ["BAIXADA", "SUSPENSA", "INAPTA", "NULA"];

/**
 * Avalia a situação cadastral do CNPJ.
 *
 * Prioridade: situação cadastral irregular > não verificado > regular.
 */
export function avaliarQualificacao(entrada: EntradaQualificacao): DomainResult<ResultadoQualificacao> {
  const violations: Violation[] = [];

  if (
    entrada.situacaoCadastral &&
    SITUACOES_IRREGULARES.includes(entrada.situacaoCadastral.trim().toUpperCase())
  ) {
    violations.push({
      code: "R-19-03",
      rule: `Situação cadastral do CNPJ irregular: ${entrada.situacaoCadastral}`,
      severity: "warn",
    });
    return {
      value: {
        status: "cadastro_irregular",
        alerta: true,
        mensagem: `Situação cadastral: ${entrada.situacaoCadastral} — verificar antes de prosseguir.`,
      },
      valid: true,
      violations,
    };
  }

  if (!entrada.situacaoCadastral) {
    return {
      value: {
        status: "nao_verificado",
        alerta: true,
        mensagem: "Situação cadastral não pôde ser obtida — qualificação não verificada.",
      },
      valid: true,
      violations: [],
    };
  }

  return {
    value: {
      status: "regular",
      alerta: false,
      mensagem: `Situação cadastral: ${entrada.situacaoCadastral}.`,
    },
    valid: true,
    violations: [],
  };
}
