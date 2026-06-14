import { FileText, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatBRL } from "@/lib/formatters";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const METODO_LABEL: Record<string, string> = {
  media: "Média aritmética",
  mediana: "Mediana",
  menor_valor: "Menor valor",
  "menor-valor": "Menor valor",
};

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(date));
}

interface SerieData {
  metodo: string;
  valorEstimado: number | { toString(): string };
  precosIncluidos: number;
  totalPrecos: number;
  coeficienteVariacao: number | { toString(): string };
}

interface ProcessoData {
  id: string;
  numero: string;
  objeto: string;
  responsavel: string;
  dataAbertura: Date | string;
  quantidade: number;
  unidade: string;
  classificacao: string;
  status: string;
}

interface RelatorioResumoCardProps {
  processo: ProcessoData;
  serie?: SerieData;
}

const linkBtn = cn(
  buttonVariants({ variant: "outline", size: "sm" }),
  "gap-2 h-8 no-underline",
);

export function RelatorioResumoCard({ processo, serie }: RelatorioResumoCardProps) {
  const valorEstimado = serie ? Number(serie.valorEstimado) : 0;
  const cv = serie ? Number(serie.coeficienteVariacao) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">{processo.numero}</CardTitle>
          <p className="text-sm text-muted-foreground mt-0.5">{processo.objeto}</p>
        </div>
        <StatusBadge status={processo.status as never} />
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
                  {formatBRL(valorEstimado)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Método</p>
                <p className="font-medium">{METODO_LABEL[serie.metodo] ?? serie.metodo}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Preços na série</p>
                <p className="font-medium tabular-nums">
                  {serie.precosIncluidos}/{serie.totalPrecos} incluídos
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CV (dispersão)</p>
                <p className="font-medium tabular-nums">{cv.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Série de preços ainda não consolidada.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <a href={`/processos/${processo.id}`} className={linkBtn}>
            <FileText className="size-3.5" />
            Ver processo
          </a>
          {serie && (
            <>
              <a href={`/api/relatorios/${processo.id}/pdf`} download className={linkBtn}>
                <FileText className="size-3.5" />
                Memória de cálculo (PDF)
              </a>
              <a href={`/api/relatorios/${processo.id}/xlsx`} download className={linkBtn}>
                <FileSpreadsheet className="size-3.5" />
                Série de preços (Excel)
              </a>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
