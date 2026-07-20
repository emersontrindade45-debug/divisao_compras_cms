"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ProcessoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ProcessoDetalhePage]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-10 text-center">
      <AlertTriangle className="size-8 text-destructive" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium">Erro ao carregar o processo</p>
        <p className="text-sm text-muted-foreground">
          Ocorreu um erro inesperado. Isso pode ser causado por uma migração de banco de dados
          pendente ou por indisponibilidade temporária do serviço.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">Código: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset} variant="outline" size="sm">
          Tentar novamente
        </Button>
        <Button render={<Link href="/processos" />} variant="ghost" size="sm">
          Voltar para a lista
        </Button>
      </div>
    </div>
  );
}
