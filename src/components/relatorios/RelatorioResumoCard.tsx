import { FileText, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatBRL, formatDate } from "@/lib/formatters";
import type { ProcessoFixture } from "@/lib/fixtures/processos";
import type { SeriePrecoFixture } from "@/lib/fixtures/seriePrecos";

const METODO_LABEL: Record<string, string> = {
  media: "Média aritmética",
  mediana: "Mediana",
  "menor-valor": "Menor valor",
};

interface RelatorioResumoCardProps {
  processo: ProcessoFixture;
  serie?: SeriePrecoFixture;
}

export function RelatorioResumoCard({ processo, serie }: RelatorioResumoCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">{processo.numero}</CardTitle>
          <p className="text-sm text-muted-foreground mt-0.5">{processo.objeto}</p>
        </div>
        <StatusBadge status={processo.status} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Responsável</p>
            <p className="font-medium">{processo.responsavel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Abertura</p>
            <p className="font-medium tabular-nums">{formatDate(processo.dataAbertura)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Qtd. / Unidade</p>
            <p className="font-medium tabular-nums">
              {processo.quantidade} {processo.unidade}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Classificação</p>
            <p className="font-medium capitalize">{processo.classificacao}</p>
          </div>
        </div>

        {serie ? (
          <div className="rounded-md border bg-primary/5 p-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Valor estimado</p>
                <p className="text-lg font-semibold tabular-nums">
                  {formatBRL(serie.valorEstimado)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Método</p>
                <p className="font-medium">{METODO_LABEL[serie.metodo]}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Preços na série</p>
                <p className="font-medium tabular-nums">
                  {serie.precosIncluidos}/{serie.totalPrecos} incluídos
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CV (dispersão)</p>
                <p className="font-medium tabular-nums">{serie.coeficienteVariacao.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Série de preços ainda não consolidada.
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" className="gap-2 h-8">
            <FileText className="size-3.5" />
            Relatório resumido
          </Button>
          <Button variant="outline" size="sm" className="gap-2 h-8">
            <FileText className="size-3.5" />
            Relatório completo
          </Button>
          <Button variant="outline" size="sm" className="gap-2 h-8">
            <Download className="size-3.5" />
            Memória de cálculo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
