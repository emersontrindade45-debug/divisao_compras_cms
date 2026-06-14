import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SiteListaBadgeProps {
  lista: "branca" | "cinza" | "vermelha";
  className?: string;
}

const LISTA_CONFIG: Record<
  "branca" | "cinza" | "vermelha",
  { label: string; className: string }
> = {
  branca: {
    label: "Admissível",
    className: "bg-success text-success-foreground border-transparent",
  },
  cinza: {
    label: "Com ressalva",
    className: "bg-warning text-warning-foreground border-transparent",
  },
  vermelha: {
    label: "Bloqueado",
    className: "bg-danger text-danger-foreground border-transparent",
  },
};

export function SiteListaBadge({ lista, className }: SiteListaBadgeProps) {
  const config = LISTA_CONFIG[lista];
  return (
    <Badge className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
