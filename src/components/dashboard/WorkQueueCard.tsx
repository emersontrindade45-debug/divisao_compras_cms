import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { FilaItem } from "@/lib/domain/filaTrabalho";
import { cn } from "@/lib/utils";

/** Quanto menor a urgência, mais forte o destaque. */
const CLASSE_URGENCIA: Record<number, string> = {
  1: "bg-danger/15 text-danger-strong border-danger/20",
  2: "bg-warning/20 text-warning-foreground border-warning/30 dark:text-warning",
  3: "bg-warning/15 text-warning-foreground border-warning/20 dark:text-warning",
};

/**
 * Fila de trabalho: o que fazer a seguir, em ordem de urgência.
 *
 * Substitui o antigo card "Resumo de processos", que repetia as contagens já
 * exibidas nas métricas acima sem dizer o que fazer com elas.
 */
export function WorkQueueCard({ itens }: { itens: FilaItem[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4" />
          Fila de trabalho
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Processos com pendência, do mais urgente para o menos.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum processo com pendência no momento.
          </p>
        ) : (
          itens.map((item) => (
            <Link
              key={item.processoId}
              href={item.href}
              className="group flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors hover:border-primary/40 hover:bg-muted/50"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium tabular-nums">{item.numero}</p>
                <p className="truncate text-xs text-muted-foreground">{item.objeto}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("text-xs", CLASSE_URGENCIA[item.urgencia])}
                >
                  {item.proximaAcao}
                </Badge>
                <ArrowRight
                  className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
