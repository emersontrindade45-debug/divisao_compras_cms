"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SegmentErrorProps {
  reset: () => void;
  title?: string;
}

export function SegmentError({ reset, title = "Erro ao carregar esta seção" }: SegmentErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <AlertTriangle className="size-8 text-destructive" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">
          Ocorreu um erro inesperado. Tente novamente ou contate o suporte.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  );
}
