export interface Violation {
  code: string;
  rule: string;
  severity: "block" | "warn" | "info";
}

export interface DomainResult<T> {
  value: T;
  valid: boolean;
  violations: Violation[];
}

export interface EstatisticaPrecos {
  media: number;
  mediana: number;
  menorValor: number;
  coeficienteVariacao: number;
  totalPrecos: number;
  precosIncluidos: number;
  precosExcluidos: number;
  valorEstimado: number;
}

export interface ValidacaoFonte {
  fonteId: string;
  valida: boolean;
  motivo?: string;
}
