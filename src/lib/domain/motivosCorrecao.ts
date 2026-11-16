/**
 * Motivos de retrabalho (M30.0): exigidos ao mover um processo para a fase
 * `em_correcao`. Lista FECHADA, para o indicador "% retrabalho por falha
 * documental" (PRD, métricas de sucesso) não depender de texto livre.
 */

export const MOTIVOS_CORRECAO = [
  "evidencia_ausente",
  "fonte_inadmissivel",
  "serie_insuficiente",
  "dispersao_sem_analise",
  "mudanca_requisitante",
  "apontamento_controle",
  "outro",
] as const;

export type MotivoCorrecao = (typeof MOTIVOS_CORRECAO)[number];

interface ConfigMotivo {
  label: string;
  /** Conta no indicador "retrabalho por falha documental". */
  falhaDocumental: boolean;
}

export const MOTIVO_CORRECAO_CONFIG: Record<MotivoCorrecao, ConfigMotivo> = {
  evidencia_ausente: {
    label: "Evidência ausente, ilegível ou sem data/hora de acesso",
    falhaDocumental: true,
  },
  fonte_inadmissivel: {
    label: "Fonte inadmissível (marketplace, contrato do próprio órgão, preço estimado)",
    falhaDocumental: true,
  },
  serie_insuficiente: {
    label: "Série com menos de 3 preços sem justificativa",
    falhaDocumental: true,
  },
  dispersao_sem_analise: {
    label: "Dispersão alta sem análise crítica",
    falhaDocumental: true,
  },
  mudanca_requisitante: {
    label: "Mudança de especificação ou quantidade pelo requisitante",
    falhaDocumental: false,
  },
  apontamento_controle: {
    label: "Apontamento do controle interno ou jurídico",
    falhaDocumental: false,
  },
  outro: { label: "Outro (descrever)", falhaDocumental: false },
};

export function ehFalhaDocumental(motivo: MotivoCorrecao): boolean {
  return MOTIVO_CORRECAO_CONFIG[motivo].falhaDocumental;
}
