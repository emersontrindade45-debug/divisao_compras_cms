"use client";

import { AlertTriangle, Check, Circle, Minus } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EstadoEtapa, EtapaFluxo } from "@/lib/domain/conformidade";
import { cn } from "@/lib/utils";

const ICONE_ESTADO: Record<EstadoEtapa, typeof Check> = {
  concluida: Check,
  atencao: AlertTriangle,
  em_andamento: Circle,
  pendente: Circle,
  nao_aplicavel: Minus,
};

const CLASSE_MARCADOR: Record<EstadoEtapa, string> = {
  concluida: "bg-success text-success-foreground border-transparent",
  atencao: "bg-warning text-warning-foreground border-transparent",
  em_andamento: "bg-primary text-primary-foreground border-transparent",
  pendente: "bg-muted text-muted-foreground border-border",
  nao_aplicavel: "bg-muted/50 text-muted-foreground border-dashed border-border",
};

const ROTULO_ESTADO: Record<EstadoEtapa, string> = {
  concluida: "concluída",
  atencao: "requer atenção",
  em_andamento: "em andamento",
  pendente: "pendente",
  nao_aplicavel: "não se aplica",
};

/**
 * Trilha de etapas do processo, no lugar da lista de abas plana.
 *
 * As etapas seguem a ordem do fluxo da IN 65/2021, mas continuam clicáveis fora
 * de ordem — o servidor frequentemente precisa voltar a uma etapa anterior. A
 * numeração e o estado comunicam a ordem recomendada sem impedi-la.
 */
export function ProcessoStepper({ etapas }: { etapas: EtapaFluxo[] }) {
  return (
    <TabsList className="h-auto! w-full flex-col items-stretch gap-1 p-1 sm:flex-row sm:items-stretch">
      {etapas.map((etapa) => {
        const Icone = ICONE_ESTADO[etapa.estado];
        const concluida = etapa.estado === "concluida";
        return (
          <TabsTrigger
            key={etapa.id}
            value={etapa.id}
            className="h-auto! flex-1 justify-start gap-2.5 whitespace-normal px-2.5 py-2 text-left"
            aria-label={`Etapa ${etapa.numero}: ${etapa.titulo} — ${ROTULO_ESTADO[etapa.estado]}`}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                CLASSE_MARCADOR[etapa.estado],
              )}
              aria-hidden
            >
              {concluida || etapa.estado === "atencao" ? (
                <Icone className="size-3.5" />
              ) : (
                etapa.numero
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{etapa.titulo}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {etapa.resumo}
              </span>
            </span>
          </TabsTrigger>
        );
      })}
    </TabsList>
  );
}
