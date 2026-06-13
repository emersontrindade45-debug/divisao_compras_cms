export type StatusDominio = "aderente" | "parcial" | "nao-aderente" | "pendente";

export type StatusVariant = "success" | "warning" | "danger" | "neutral";

export const STATUS_CONFIG: Record<StatusDominio, { label: string; variant: StatusVariant }> = {
  aderente: { label: "Aderente", variant: "success" },
  parcial: { label: "Parcial", variant: "warning" },
  "nao-aderente": { label: "Não aderente", variant: "danger" },
  pendente: { label: "Pendente", variant: "neutral" },
};
