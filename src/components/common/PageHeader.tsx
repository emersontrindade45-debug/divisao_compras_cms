import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Ações à direita do título (botões, filtros de topo). */
  actions?: ReactNode;
  className?: string;
}

/**
 * Cabeçalho padrão das páginas da área autenticada.
 *
 * Existe para que título e subtítulo tenham o mesmo peso e espaçamento em todos
 * os módulos — antes o bloco era copiado em cada página, e a densidade variava.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3",
        className,
      )}
    >
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
