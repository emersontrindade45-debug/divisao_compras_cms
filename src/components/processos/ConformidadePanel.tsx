import Link from "next/link";
import { AlertTriangle, Check, Minus, ShieldCheck, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ConformidadeProcesso,
  EstadoItemConformidade,
} from "@/lib/domain/conformidade";
import { cn } from "@/lib/utils";

const ICONE: Record<EstadoItemConformidade, typeof Check> = {
  ok: Check,
  atencao: AlertTriangle,
  bloqueio: X,
  nao_aplicavel: Minus,
};

const CLASSE_ICONE: Record<EstadoItemConformidade, string> = {
  ok: "bg-success/15 text-success",
  atencao: "bg-warning/20 text-warning-foreground dark:text-warning",
  bloqueio: "bg-danger/15 text-danger-strong",
  nao_aplicavel: "bg-muted text-muted-foreground",
};

const ROTULO: Record<EstadoItemConformidade, string> = {
  ok: "atendido",
  atencao: "requer atenção",
  bloqueio: "impeditivo",
  nao_aplicavel: "não se aplica",
};

/**
 * Checklist vivo de conformidade com a IN 65/2021, ao lado do processo.
 *
 * Responde a pergunta que o servidor faz o tempo todo — "já posso fechar?" —
 * sem exigir que ele saiba a norma de cor. Cada linha aponta para a etapa em
 * que a pendência se resolve.
 */
export function ConformidadePanel({
  conformidade,
  processoId,
}: {
  conformidade: ConformidadeProcesso;
  processoId: string;
}) {
  const pendencias = conformidade.itens.filter(
    (i) => i.estado === "bloqueio" || i.estado === "atencao",
  ).length;
  const impeditivos = conformidade.itens.some((i) => i.estado === "bloqueio");

  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="size-4" />
          Conformidade IN 65/2021
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {pendencias === 0
            ? "Nenhuma pendência registrada."
            : impeditivos
              ? `${pendencias} pendência(s), com item impeditivo.`
              : `${pendencias} pendência(s) a resolver.`}
        </p>
      </CardHeader>
      <CardContent className="space-y-1 pb-4">
        {conformidade.itens.map((item) => {
          const Icone = ICONE[item.estado];
          return (
            <Link
              key={item.codigo}
              href={`/processos/${processoId}?etapa=${item.etapaAlvo}`}
              className="flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted/60"
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                  CLASSE_ICONE[item.estado],
                )}
                aria-hidden
              >
                <Icone className="size-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium">
                  {item.titulo}
                  <span className="sr-only"> — {ROTULO[item.estado]}</span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {item.detalhe}
                </span>
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
