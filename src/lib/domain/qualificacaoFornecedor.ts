import type { DomainResult, Violation } from "./types";

/**
 * Regra de negócio da qualificação de fornecedor (M19): combina o resultado
 * da consulta de sanções (CEIS/CNEP) com a situação cadastral de CNPJ num
 * único status, e decide se a proposta deve receber alerta.
 *
 * Puro quanto a I/O — não faz fetch nem toca no Prisma; recebe os resultados
 * já obtidos pelos clientes de `lib/integracoes/` (CLAUDE.md §2, domínio
 * separado de integração).
 */

export type StatusQualificacao = "regular" | "sancionado" | "cadastro_irregular" | "nao_verificado";

interface SancaoResumo {
  origem: "CEIS" | "CNEP";
  tipoSancao: string | null;
}

export interface EntradaQualificacao {
  consultaSancoesNegada: boolean;
  motivoNegacaoSancoes?: string;
  sancoesEncontradas: SancaoResumo[];
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
 * Combina sanções (CEIS/CNEP) e situação cadastral num status único.
 *
 * Prioridade: sanção > situação cadastral irregular > não verificado > regular.
 * Uma consulta de sanções negada por falta de token NUNCA vira "regular" — cai
 * em `nao_verificado`, que é um estado distinto e sinalizado (CLAUDE.md §9.45).
 */
export function avaliarQualificacao(entrada: EntradaQualificacao): DomainResult<ResultadoQualificacao> {
  const violations: Violation[] = [];

  if (entrada.consultaSancoesNegada) {
    violations.push({
      code: "R-19-01",
      rule: `Consulta de sanções (CEIS/CNEP) negada: ${entrada.motivoNegacaoSancoes ?? "motivo não informado"}`,
      severity: "warn",
    });
    return {
      value: {
        status: "nao_verificado",
        alerta: true,
        mensagem:
          "Consulta de sanções não pôde ser realizada — qualificação do fornecedor não verificada. " +
          "Não presumir 'regular' sem consulta bem-sucedida.",
      },
      valid: true,
      violations,
    };
  }

  if (entrada.sancoesEncontradas.length > 0) {
    violations.push({
      code: "R-19-02",
      rule: "Fornecedor consta em CEIS/CNEP (sancionado) — exige análise crítica antes de aceitar proposta.",
      severity: "block",
    });
    const origens = [...new Set(entrada.sancoesEncontradas.map((s) => s.origem))].join(" e ");
    return {
      value: {
        status: "sancionado",
        alerta: true,
        mensagem: `Fornecedor sancionado (${origens}) — ${entrada.sancoesEncontradas.length} registro(s) encontrado(s).`,
      },
      valid: false,
      violations,
    };
  }

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
      mensagem: `Sem sanções encontradas. Situação cadastral: ${entrada.situacaoCadastral}.`,
    },
    valid: true,
    violations: [],
  };
}
