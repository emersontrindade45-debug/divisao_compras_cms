"use client";

import { useState } from "react";
import { Info, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { SeriePrecoFixture, MetodoConsolidacao } from "@/lib/fixtures/seriePrecos";
import { cn } from "@/lib/utils";

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/50 w-52";

const FONTE_LABEL: Record<string, string> = {
  "contratacao-publica": "Contratação pública",
  "site-eletronico": "Site eletrônico",
  "fornecedor-direto": "Fornecedor direto",
};

const FONTE_BADGE: Record<string, string> = {
  "contratacao-publica": "bg-primary/10 text-primary border-primary/20",
  "site-eletronico": "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  "fornecedor-direto": "bg-muted text-muted-foreground",
};

const METODO_LABEL: Record<MetodoConsolidacao, string> = {
  media: "Média aritmética",
  mediana: "Mediana",
  "menor-valor": "Menor valor",
};

function CvIndicator({ cv }: { cv: number }) {
  const alto = cv > 25;
  const medio = cv > 15;
  return (
    <span
      className={cn(
        "tabular-nums text-sm font-medium",
        alto && "text-danger",
        medio && !alto && "text-warning",
        !medio && "text-success",
      )}
    >
      {cv.toFixed(1)}%
      {alto && (
        <span className="ml-1 text-xs text-danger">⚠ Alta dispersão</span>
      )}
    </span>
  );
}

export function TabelaSeriePrecos({ serie }: { serie: SeriePrecoFixture }) {
  const [metodo, setMetodo] = useState<MetodoConsolidacao>(serie.metodo);

  const valorDestacado =
    metodo === "media"
      ? serie.media
      : metodo === "mediana"
        ? serie.mediana
        : serie.menorValor;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3 sm:items-center">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Método de consolidação</span>
        </div>
        <select
          className={SELECT_CLASS}
          value={metodo}
          onChange={(e) => setMetodo(e.target.value as MetodoConsolidacao)}
          aria-label="Método de consolidação"
        >
          <option value="media">Média aritmética</option>
          <option value="mediana">Mediana</option>
          <option value="menor-valor">Menor valor</option>
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="sm:col-span-1 border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Valor estimado ({METODO_LABEL[metodo]})
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatBRL(valorDestacado)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Média</p>
            <p className="mt-1 text-lg font-medium tabular-nums">{formatBRL(serie.media)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Mediana</p>
            <p className="mt-1 text-lg font-medium tabular-nums">{formatBRL(serie.mediana)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">CV (dispersão)</p>
            <div className="mt-1">
              <CvIndicator cv={serie.coeficienteVariacao} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Preços da série</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="size-3.5" />
            {serie.precosIncluidos}/{serie.totalPrecos} incluídos
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fonte</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fornecedor / Órgão</TableHead>
                <TableHead>Data ref.</TableHead>
                <TableHead className="text-right">Valor unit.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Motivo exclusão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serie.precos.map((p) => (
                <TableRow
                  key={p.id}
                  className={cn(p.status === "excluido" && "opacity-50")}
                >
                  <TableCell className="text-sm max-w-48 truncate" title={p.descricaoFonte}>
                    {p.descricaoFonte}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("text-xs", FONTE_BADGE[p.fonte])}
                    >
                      {FONTE_LABEL[p.fonte]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{p.fornecedorOuOrgao}</TableCell>
                  <TableCell>
                    <span className="tabular-nums text-sm text-muted-foreground">
                      {formatDate(p.dataReferencia)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="tabular-nums text-sm font-medium">
                      {formatBRL(p.valorUnitario)}
                    </span>
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
                  <TableCell className="text-xs text-muted-foreground max-w-48 truncate" title={p.motivoExclusao}>
                    {p.motivoExclusao ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
