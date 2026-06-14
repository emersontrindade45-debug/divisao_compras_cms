import type { DomainResult, EstatisticaPrecos, ValidacaoFonte, Violation } from "./types";

function medianaArr(valores: number[]): number {
  const sorted = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function mediaArr(valores: number[]): number {
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function desvioPadrao(valores: number[], avg: number): number {
  const variance = valores.reduce((acc, v) => acc + (v - avg) ** 2, 0) / valores.length;
  return Math.sqrt(variance);
}

export function excluirDiscrepantes(
  precos: number[],
  tipoObjeto: "aquisicao" | "obra",
): {
  incluidos: number[];
  excluidos: number[];
  limiteInferior: number;
  limiteSuperior: number;
} {
  if (precos.length === 0) {
    return { incluidos: [], excluidos: [], limiteInferior: 0, limiteSuperior: 0 };
  }

  const tolerancia = tipoObjeto === "obra" ? 0.75 : 0.3;
  const med = medianaArr(precos);
  const limiteInferior = med * (1 - tolerancia);
  const limiteSuperior = med * (1 + tolerancia);

  const incluidos: number[] = [];
  const excluidos: number[] = [];
  for (const p of precos) {
    if (p >= limiteInferior && p <= limiteSuperior) {
      incluidos.push(p);
    } else {
      excluidos.push(p);
    }
  }
  return { incluidos, excluidos, limiteInferior, limiteSuperior };
}

export function calcularEstatisticas(
  precosIncluidos: number[],
  metodo: "media" | "mediana" | "menor_valor",
): DomainResult<EstatisticaPrecos> {
  const violations: Violation[] = [];

  if (precosIncluidos.length < 3) {
    return {
      value: {
        media: 0,
        mediana: 0,
        menorValor: 0,
        coeficienteVariacao: 0,
        totalPrecos: precosIncluidos.length,
        precosIncluidos: precosIncluidos.length,
        precosExcluidos: 0,
        valorEstimado: 0,
      },
      valid: false,
      violations: [
        {
          code: "OP-ADH-04",
          rule: "Quadro Demonstrativo exige ≥ 3 preços válidos após tratamento estatístico",
          severity: "block",
        },
      ],
    };
  }

  const avg = mediaArr(precosIncluidos);
  const med = medianaArr(precosIncluidos);
  const menor = Math.min(...precosIncluidos);
  const dp = desvioPadrao(precosIncluidos, avg);
  const cv = (dp / avg) * 100;

  if (cv > 30) {
    violations.push({
      code: "R-06",
      rule: "Grande dispersão de preços: análise crítica obrigatória (CV > 30%)",
      severity: "warn",
    });
  }

  const valorEstimado =
    metodo === "media" ? avg : metodo === "mediana" ? med : menor;

  return {
    value: {
      media: avg,
      mediana: med,
      menorValor: menor,
      coeficienteVariacao: cv,
      totalPrecos: precosIncluidos.length,
      precosIncluidos: precosIncluidos.length,
      precosExcluidos: 0,
      valorEstimado,
    },
    valid: violations.every((v) => v.severity !== "block"),
    violations,
  };
}

export function validarEvidenciasFontes(
  fontes: Array<{ id: string; evidencias: Array<{ dataHoraAcesso: Date }> }>,
): DomainResult<ValidacaoFonte[]> {
  const violations: Violation[] = [];
  const resultado: ValidacaoFonte[] = [];

  for (const fonte of fontes) {
    const valida = fonte.evidencias.length > 0;
    resultado.push({
      fonteId: fonte.id,
      valida,
      motivo: valida ? undefined : "Nenhuma evidência com data/hora de acesso registrada",
    });
    if (!valida) {
      violations.push({
        code: "R-02",
        rule: "Preço sem evidência vinculada (fonte + data + evidência obrigatórios)",
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
