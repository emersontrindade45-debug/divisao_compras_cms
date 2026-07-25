"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

interface SegmentErrorProps {
  reset: () => void;
  title?: string;
  /**
   * Erro capturado pelo boundary. Reportado ao Sentry para observabilidade da
   * equipe — sem isso o erro só existe na tela do usuário (docs/PLAN.md, M11).
   * Opcional para não quebrar usos que só querem o visual.
   */
  error?: Error & { digest?: string };
}

export function SegmentError({
  reset,
  title = "Erro ao carregar esta seção",
  error,
}: SegmentErrorProps) {
  useEffect(() => {
    if (error) {
      // No-op quando não há DSN configurado — ver src/sentry.server.config.ts.
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <AlertTriangle className="size-8 text-destructive" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">
          Ocorreu um erro inesperado. Tente novamente ou contate o suporte.
        </p>
        {/*
          O `digest` é o identificador que o Next gera para erros de servidor e
          o único elo entre a tela do usuário e o log/evento correspondente.
          Exibi-lo permite que o usuário informe o código ao suporte.
        */}
        {error?.digest ? (
          <p className="text-xs text-muted-foreground">
            Código do erro: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
      </div>
      <Button variant="outline" size="sm" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  );
}
