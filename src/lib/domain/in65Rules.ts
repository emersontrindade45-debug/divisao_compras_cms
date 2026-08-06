import type { DomainResult, Violation } from "./types";

/**
 * Mínimo de fornecedores consultados na pesquisa direta (R-03 da IN 65/2021).
 *
 * Separada de `MIN_FONTES_SUFICIENCIA`, que vale 3 pelo mesmo acaso mas mede
 * outra coisa (fontes com evidência na série). Eram usadas de forma
 * intercambiável; se um dia a suficiência de fontes mudar para 4, a regra de
 * fornecedores não pode mudar junto em silêncio.
 */
export const MIN_FORNECEDORES_PESQUISA_DIRETA = 3;

// Janela padrão IN 65/2021: 365 dias para contratações públicas.
// Ampliada para 730 dias (2 anos) porque serviços específicos (ex.: certificados
// digitais, licenças de software) têm poucos contratos publicados por ano no
// PNCP, tornando inviável encontrar 3 referências dentro de 12 meses. A norma
// admite flexibilização quando o mercado é restrito — o auditor é informado via
// campo "adaptado" no candidato. Sites e fornecedores mantêm os prazos originais.
const JANELAS_VALIDADE: Record<string, number> = {
  contratacao_publica: 730,
  site_eletronico: 90,
  fornecedor_direto: 180,
};

/**
 * Janelas de contratação pública diferenciadas por natureza do objeto: 18 meses
 * (≈547,5 dias, arredondado para 548) para serviço contínuo, 12 meses (365 dias)
 * para bem de consumo. `Item.natureza` no schema é nullable — item ainda não
 * classificado cai no teto de `JANELAS_VALIDADE.contratacao_publica` (730 dias)
 * em vez de ser reclassificado silenciosamente com uma janela mais curta.
 */
export const JANELA_BEM_CONSUMO_DIAS = 365;
export const JANELA_SERVICO_CONTINUO_DIAS = 548;

type NaturezaObjetoDominio = "bem_consumo" | "servico_continuo";

function janelaContratacaoPublica(naturezaObjeto?: NaturezaObjetoDominio | null): number {
  if (naturezaObjeto === "bem_consumo") return JANELA_BEM_CONSUMO_DIAS;
  if (naturezaObjeto === "servico_continuo") return JANELA_SERVICO_CONTINUO_DIAS;
  return JANELAS_VALIDADE["contratacao_publica"]!;
}

const CODIGOS_VALIDADE: Record<string, string> = {
  contratacao_publica: "OP-SLA-06",
  site_eletronico: "OP-SLA-04",
  fornecedor_direto: "OP-SLA-03",
};

export function validarMinFornecedores(
  fornecedoresConsultados: number,
  comJustificativa: boolean,
): DomainResult<void> {
  if (fornecedoresConsultados === 0) {
    return {
      value: undefined,
      valid: false,
      violations: [
        {
          code: "R-03",
          rule: "Pesquisa direta exige ≥ 3 fornecedores consultados",
          severity: "block",
        },
      ],
    };
  }

  if (fornecedoresConsultados >= MIN_FORNECEDORES_PESQUISA_DIRETA) {
    return { value: undefined, valid: true, violations: [] };
  }

  if (comJustificativa) {
    return {
      value: undefined,
      valid: true,
      violations: [
        {
          code: "OP-EXC-01",
          rule: "Exceção: < 3 fornecedores com justificativa — requer aprovação",
          severity: "warn",
        },
      ],
    };
  }

  return {
    value: undefined,
    valid: false,
    violations: [
      {
        code: "R-03",
        rule: "Pesquisa direta exige ≥ 3 fornecedores consultados",
        severity: "block",
      },
    ],
  };
}

export function validarFontePublica(
  usouFontePublica: boolean,
  justificativa?: string,
): DomainResult<void> {
  if (usouFontePublica) {
    return { value: undefined, valid: true, violations: [] };
  }

  if (justificativa && justificativa.trim().length > 0) {
    return {
      value: undefined,
      valid: true,
      violations: [
        {
          code: "OP-EXC-02",
          rule: "Não uso de fonte pública com justificativa — requer aprovação",
          severity: "warn",
        },
      ],
    };
  }

  return {
    value: undefined,
    valid: false,
    violations: [
      {
        code: "R-07",
        rule: "Fonte pública não utilizada sem justificativa registrada",
        severity: "block",
      },
    ],
  };
}

export function validarValidadeFontes(
  fontes: Array<{
    fonteId: string;
    tipo: "contratacao_publica" | "site_eletronico" | "fornecedor_direto";
    dataReferencia: Date;
    /** Só usado quando `tipo === "contratacao_publica"`; ver `janelaContratacaoPublica`. */
    naturezaObjeto?: NaturezaObjetoDominio | null;
  }>,
  dataReferenciaCalculo: Date,
): DomainResult<Array<{ fonteId: string; valida: boolean; diasRestantes: number }>> {
  const violations: Violation[] = [];
  const resultado: Array<{ fonteId: string; valida: boolean; diasRestantes: number }> = [];

  for (const fonte of fontes) {
    const janela =
      fonte.tipo === "contratacao_publica"
        ? janelaContratacaoPublica(fonte.naturezaObjeto)
        : JANELAS_VALIDADE[fonte.tipo]!;
    const diffMs = dataReferenciaCalculo.getTime() - fonte.dataReferencia.getTime();
    const diasDecorridos = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diasRestantes = janela - diasDecorridos;
    const valida = diasDecorridos <= janela;

    resultado.push({ fonteId: fonte.fonteId, valida, diasRestantes });

    if (!valida) {
      const code = CODIGOS_VALIDADE[fonte.tipo]!;
      violations.push({
        code,
        rule: `Fonte ${fonte.fonteId} expirada: ${Math.abs(diasRestantes)} dia(s) além do prazo de validade`,
        severity: "block",
      });
    }
  }

  return {
    value: resultado,
    valid: violations.every((v) => v.severity !== "block"),
    violations,
  };
}

export function validarRegistroNaoRespondentes(
  fornecedoresConsultados: string[],
  fornecedoresQueResponderam: string[],
): DomainResult<{ naoResponderam: string[] }> {
  const responderam = new Set(fornecedoresQueResponderam);
  const naoResponderam = fornecedoresConsultados.filter((f) => !responderam.has(f));

  if (naoResponderam.length === 0) {
    return { value: { naoResponderam: [] }, valid: true, violations: [] };
  }

  return {
    value: { naoResponderam },
    valid: true,
    violations: [
      {
        code: "R-04",
        rule: "Fornecedores sem resposta devem ter registro formal no processo",
        severity: "warn",
      },
    ],
  };
}
