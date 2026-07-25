import { Download, FileText } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { TabelaSeriePrecos } from "@/components/cotacoes/TabelaSeriePrecos";
import { buttonVariants } from "@/components/ui/button";
import type { SeriePrecoFixture } from "@/lib/fixtures/seriePrecos";
import { cn } from "@/lib/utils";

/**
 * Etapa ④ do fluxo: a série tratada e a memória de cálculo prontas para os autos.
 *
 * Os links de exportação ficam aqui, junto da série que originou o documento —
 * antes só existiam na tela de Relatórios, longe do processo em que se trabalha.
 */
export function EtapaConsolidacao({
  processoId,
  serie,
}: {
  processoId: string;
  serie?: SeriePrecoFixture;
}) {
  if (!serie) {
    return (
      <EmptyState
        icon={FileText}
        title="Nenhum preço consolidado ainda"
        description="A série de preços é consolidada a partir das fontes com evidência válida. Registre ao menos três preços na etapa de pesquisa."
      />
    );
  }

  return (
    <div className="space-y-4">
      <TabelaSeriePrecos serie={serie} />

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-4 py-3">
        <p className="mr-auto text-sm text-muted-foreground">
          Memória de cálculo e série de preços para instrução processual.
        </p>
        <a
          href={`/api/relatorios/${processoId}/pdf`}
          download
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        >
          <Download className="size-3.5" />
          Memória de cálculo (PDF)
        </a>
        <a
          href={`/api/relatorios/${processoId}/xlsx`}
          download
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        >
          <Download className="size-3.5" />
          Série de preços (Excel)
        </a>
      </div>
    </div>
  );
}
