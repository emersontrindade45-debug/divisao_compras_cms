export type StatusDominio = "aderente" | "parcial" | "nao-aderente" | "pendente";

export type StatusVariant = "success" | "warning" | "danger" | "neutral";

export const STATUS_CONFIG: Record<StatusDominio, { label: string; variant: StatusVariant }> = {
  aderente: { label: "Aderente", variant: "success" },
  parcial: { label: "Parcial", variant: "warning" },
  "nao-aderente": { label: "Não aderente", variant: "danger" },
  pendente: { label: "Pendente", variant: "neutral" },
};

// Classes Tailwind dos 4 tokens semânticos do projeto (CLAUDE.md §5).
// Centralizado aqui para todo badge de status (aderência, fase de
// andamento, ...) usar a mesma paleta em vez de reimplementar as classes.
export const VARIANT_CLASSES: Record<StatusVariant, string> = {
  success: "bg-success text-success-foreground border-transparent",
  warning: "bg-warning text-warning-foreground border-transparent",
  danger: "bg-danger text-danger-foreground border-transparent",
  neutral: "bg-muted text-muted-foreground border-transparent",
};
