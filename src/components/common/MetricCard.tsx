import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  delta,
  hint,
  icon: Icon,
  href,
}: {
  label: string;
  value: string | number;
  delta?: { value: string; positive: boolean };
  hint?: string;
  icon?: LucideIcon;
  /** Quando informado, o card inteiro vira link para a lista correspondente. */
  href?: string;
}) {
  const card = (
    <Card
      className={cn(
        href && "h-full transition-colors hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden /> : null}
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          {delta ? (
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                delta.positive ? "text-success" : "text-danger",
              )}
            >
              {delta.value}
            </span>
          ) : null}
        </div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );

  if (!href) return card;

  return (
    <Link href={href} className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
      {card}
    </Link>
  );
}
