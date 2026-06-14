"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StatusCotacao } from "@/lib/fixtures/cotacoes";

const CONFIG: Record<StatusCotacao, { label: string; className: string }> = {
  positiva: {
    label: "Positiva",
    className: "bg-success text-success-foreground border-transparent",
  },
  negativa: {
    label: "Negativa",
    className: "bg-danger text-danger-foreground border-transparent",
  },
  incompleta: {
    label: "Incompleta",
    className: "bg-warning text-warning-foreground border-transparent",
  },
  silenciosa: {
    label: "Silenciosa",
    className: "bg-muted text-muted-foreground border-transparent",
  },
};

export function StatusCotacaoBadge({
  status,
  className,
}: {
  status: StatusCotacao;
  className?: string;
}) {
  const { label, className: base } = CONFIG[status];
  return <Badge className={cn(base, className)}>{label}</Badge>;
}
