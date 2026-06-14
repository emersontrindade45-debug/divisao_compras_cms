import type { DomainResult, Violation } from "./types";

const JANELAS_VALIDADE: Record<string, number> = {
  contratacao_publica: 365,
  site_eletronico: 90,
  fornecedor_direto: 180,
};

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

  if (fornecedoresConsultados >= 3) {
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
  }>,
  dataReferenciaCalculo: Date,
): DomainResult<Array<{ fonteId: string; valida: boolean; diasRestantes: number }>> {
  const violations: Violation[] = [];
  const resultado: Array<{ fonteId: string; valida: boolean; diasRestantes: number }> = [];

  for (const fonte of fontes) {
    const janela = JANELAS_VALIDADE[fonte.tipo]!;
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
