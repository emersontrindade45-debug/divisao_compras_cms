"use client";

import Link from "next/link";
import { AlertTriangle, Check, Minus, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
 * Checklist de conformidade com a IN 65/2021, ao lado do título do processo.
 *
 * Responde a pergunta que o servidor faz o tempo todo — "já posso fechar?" —
 * sem exigir que ele saiba a norma de cor. Vive atrás de um gatilho compacto
 * (não de um card fixo na página) porque é material de consulta ocasional:
 * como card sempre visível, disputava 20rem de largura com o conteúdo
 * principal e com o assistente, justo quando os dois mais precisam do espaço.
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

  const resumo =
    pendencias === 0
      ? "Nenhuma pendência registrada."
      : impeditivos
        ? `${pendencias} pendência(s), com item impeditivo.`
        : `${pendencias} pendência(s) a resolver.`;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-2">
            <ShieldCheck
              className={cn(
                "size-4",
                pendencias === 0
                  ? "text-success"
                  : impeditivos
                    ? "text-danger-strong"
                    : "text-warning-foreground dark:text-warning",
              )}
              aria-hidden
            />
            <span className="hidden sm:inline">Conformidade</span>
            {pendencias > 0 && (
              <Badge variant={impeditivos ? "destructive" : "outline"}>{pendencias}</Badge>
            )}
          </Button>
        }
      />
      <PopoverContent align="end">
        <div className="border-b px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4" aria-hidden />
            Conformidade IN 65/2021
          </p>
          <p className="text-xs text-muted-foreground">{resumo}</p>
        </div>
        <div className="space-y-1 p-2">
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
                  <span className="block text-xs text-muted-foreground">{item.detalhe}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
