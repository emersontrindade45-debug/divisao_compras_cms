import { Calculator, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, formatDate } from "@/lib/formatters";
import type { SeriePrecoFixture } from "@/lib/fixtures/seriePrecos";
import type { ProcessoFixture } from "@/lib/fixtures/processos";
import { cn } from "@/lib/utils";

const METODO_LABEL: Record<string, string> = {
  media: "Média aritmética",
  mediana: "Mediana",
  "menor-valor": "Menor valor",
};

const FONTE_LABEL: Record<string, string> = {
  "contratacao-publica": "Contratação pública",
  "site-eletronico": "Site eletrônico",
  "fornecedor-direto": "Fornecedor direto",
};

interface MemoriaCalculoProps {
  processo: ProcessoFixture;
  serie: SeriePrecoFixture;
}

function linhaSoma(valores: number[]): number {
  return valores.reduce((a, b) => a + b, 0);
}

function calcularMedia(valores: number[]): number {
  return linhaSoma(valores) / valores.length;
}

function calcularMediana(valores: number[]): number {
  const sorted = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function MemoriaCalculo({ processo, serie }: MemoriaCalculoProps) {
  const precosIncluidos = serie.precos.filter((p) => p.status === "incluido");
  const valores = precosIncluidos.map((p) => p.valorUnitario);

  const media = calcularMedia(valores);
  const mediana = calcularMediana(valores);
  const menorValor = Math.min(...valores);
  const maiorValor = Math.max(...valores);
  const cv = (Math.sqrt(valores.reduce((acc, v) => acc + Math.pow(v - media, 2), 0) / valores.length) / media) * 100;

  const valorAdotado =
    serie.metodo === "media" ? media : serie.metodo === "mediana" ? mediana : menorValor;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="size-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">Memória de Cálculo</h3>
        </div>
        <Button variant="outline" size="sm" className="gap-2 h-8">
          <FileDown className="size-3.5" />
          Exportar PDF
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Identificação
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Processo</p>
            <p className="font-mono font-medium">{processo.numero}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Objeto</p>
            <p className="font-medium">{processo.objeto}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Responsável</p>
            <p className="font-medium">{processo.responsavel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Qtd. estimada</p>
            <p className="font-medium tabular-nums">
              {processo.quantidade} {processo.unidade}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Método adotado</p>
            <p className="font-medium">{METODO_LABEL[serie.metodo]}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fundamento legal</p>
            <p className="font-medium">IN SEGES/ME nº 65/2021</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Preços coletados
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Fonte / Referência</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Valor unit.</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serie.precos.map((p) => (
                <TableRow key={p.id} className={cn(p.status === "excluido" && "opacity-50 line-through decoration-muted-foreground/50")}>
                  <TableCell className="pl-6 text-sm">{p.descricaoFonte}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{FONTE_LABEL[p.fonte]}</TableCell>
                  <TableCell>
                    <span className="tabular-nums text-sm">{formatDate(p.dataReferencia)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="tabular-nums text-sm font-medium">{formatBRL(p.valorUnitario)}</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        "text-xs",
                        p.status === "incluido"
                          ? "bg-success text-success-foreground border-transparent"
                          : "bg-muted text-muted-foreground border-transparent",
                      )}
                    >
                      {p.status === "incluido" ? "Incluído" : "Excluído"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Estatísticas da série ({precosIncluidos.length} preços incluídos)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Média aritmética</p>
              <p className="text-lg font-semibold tabular-nums">{formatBRL(media)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Mediana</p>
              <p className="text-lg font-semibold tabular-nums">{formatBRL(mediana)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Menor valor</p>
              <p className="text-lg font-semibold tabular-nums">{formatBRL(menorValor)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Maior valor</p>
              <p className="text-lg font-semibold tabular-nums">{formatBRL(maiorValor)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">CV (coef. variação)</p>
              <p className={cn("text-lg font-semibold tabular-nums", cv > 25 ? "text-danger" : cv > 15 ? "text-warning" : "text-success")}>
                {cv.toFixed(1)}%
              </p>
            </div>
            <div className="sm:col-span-3">
              <p className="text-xs text-muted-foreground">Valor estimado adotado ({METODO_LABEL[serie.metodo]})</p>
              <p className="text-xl font-bold tabular-nums">{formatBRL(valorAdotado)}</p>
            </div>
          </div>

          <div className="mt-4 rounded-md bg-background/60 border p-3">
            <p className="text-xs font-medium">Valor total estimado para o processo</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5">
              {formatBRL(valorAdotado * processo.quantidade)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatBRL(valorAdotado)} × {processo.quantidade} {processo.unidade}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
