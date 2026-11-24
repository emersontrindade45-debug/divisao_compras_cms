"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Imprime a página; o estilo de impressão (A4) esconde menus, filtros, gráficos e a tabela completa. */
export function BotaoImprimir() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden /> Imprimir
    </Button>
  );
}
