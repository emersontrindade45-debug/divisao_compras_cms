import type { StatusVariant } from "@/lib/domain/status";

// Fase OPERACIONAL do processo, escolhida manualmente pelo servidor — não
// confundir com `StatusDominio` (aderência à IN 65/2021), que é outra
// pergunta sobre o mesmo processo.
export type FaseAndamento = "nao_iniciado" | "em_andamento" | "concluido" | "em_correcao";

export const FASE_ANDAMENTO_CONFIG: Record<FaseAndamento, { label: string; variant: StatusVariant }> = {
  nao_iniciado: { label: "Não iniciado", variant: "neutral" },
  em_andamento: { label: "Em andamento", variant: "warning" },
  concluido: { label: "Concluído", variant: "success" },
  em_correcao: { label: "Em correção", variant: "danger" },
};

export const FASES_ANDAMENTO = Object.keys(FASE_ANDAMENTO_CONFIG) as FaseAndamento[];
