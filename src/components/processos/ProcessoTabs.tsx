"use client";

import type { ReactNode } from "react";
import { FileText, Globe } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { EmptyState } from "@/components/common/EmptyState";
import { EvidenciaPanel } from "@/components/common/EvidenciaPanel";
import { TabelaSeriePrecos } from "@/components/cotacoes/TabelaSeriePrecos";
import { EstrategiaOrquestrador } from "./EstrategiaOrquestrador";
import { PesquisaSimilaridadeUploadForm } from "./PesquisaSimilaridadeUploadForm";
import { PreencherCotacaoForm } from "./PreencherCotacaoForm";
import type { ProcessoFixture } from "@/lib/fixtures/processos";
import type { SeriePrecoFixture } from "@/lib/fixtures/seriePrecos";
import { formatBRL, formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export interface FonteResumo {
  id: string;
  itemDescricao: string;
  tipo: "contratacao_publica" | "site_eletronico" | "fornecedor_direto";
  descricao: string;
  orgaoOuFornecedor: string;
  dataReferencia: string;
  valorUnitario: number;
  status: "incluido" | "excluido";
  motivoExclusao?: string;
  totalEvidencias: number;
}

export interface EvidenciaResumo {
  id: string;
  nomeArquivo: string;
  dataHoraAcesso: string;
  url?: string;
  observacoes?: string;
}

const TIPO_FONTE_LABEL: Record<FonteResumo["tipo"], string> = {
  contratacao_publica: "Contratação pública",
  site_eletronico: "Site eletrônico",
  fornecedor_direto: "Fornecedor direto",
};

const TIPO_FONTE_BADGE: Record<FonteResumo["tipo"], string> = {
  contratacao_publica: "bg-primary/10 text-primary border-primary/20",
  site_eletronico:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  fornecedor_direto: "bg-muted text-muted-foreground",
};

export function ProcessoTabs({
  processo,
  fontes = [],
  evidencias = [],
  serie,
  fontesSimilaridade,
}: {
  processo: ProcessoFixture;
  fontes?: FonteResumo[];
  evidencias?: EvidenciaResumo[];
  serie?: SeriePrecoFixture;
  fontesSimilaridade?: ReactNode;
}) {
  return (
    <Tabs defaultValue="estrategia" className="space-y-4">
      <TabsList>
        <TabsTrigger value="estrategia">Estratégia</TabsTrigger>
        <TabsTrigger value="similaridade">Pesquisa por Similaridade</TabsTrigger>
        <TabsTrigger value="fontes">Fontes ({fontes.length})</TabsTrigger>
        <TabsTrigger value="evidencias">Evidências ({evidencias.length})</TabsTrigger>
        <TabsTrigger value="serie">Série de preços</TabsTrigger>
      </TabsList>

      <TabsContent value="estrategia" className="space-y-4">
        <EstrategiaOrquestrador
          classificacao={processo.classificacao}
          objeto={processo.objeto}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informações técnicas do objeto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">Características técnicas</p>
              <p className="text-muted-foreground">{processo.caracteristicasTecnicas}</p>
            </div>
            <div>
              <p className="font-medium">Palavras-chave</p>
              <p className="text-muted-foreground">{processo.palavrasChave.join(", ")}</p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="similaridade" className="space-y-4">
        <PesquisaSimilaridadeUploadForm processoId={processo.id} />
        <PreencherCotacaoForm processoId={processo.id} />
        {fontesSimilaridade}
      </TabsContent>

      <TabsContent value="fontes">
        {fontes.length === 0 ? (
          <EmptyState
            icon={Globe}
            title="Nenhuma fonte registrada ainda"
            description="Promova resultados da Pesquisa por Similaridade ou registre fontes pelas telas de contratações, sites e cotações."
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Órgão / Fornecedor</TableHead>
                    <TableHead>Data ref.</TableHead>
                    <TableHead className="text-right">Valor unit.</TableHead>
                    <TableHead>Evidências</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fontes.map((f) => (
                    <TableRow key={f.id} className={cn(f.status === "excluido" && "opacity-50")}>
                      <TableCell className="text-xs max-w-40 truncate" title={f.itemDescricao}>
                        {f.itemDescricao}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-xs", TIPO_FONTE_BADGE[f.tipo])}>
                          {TIPO_FONTE_LABEL[f.tipo]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-48 truncate" title={f.descricao}>
                        {f.descricao}
                      </TableCell>
                      <TableCell className="text-sm">{f.orgaoOuFornecedor}</TableCell>
                      <TableCell className="tabular-nums text-sm text-muted-foreground">
                        {formatDate(f.dataReferencia)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-medium">
                        {formatBRL(f.valorUnitario)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-sm">
                        {f.totalEvidencias}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "text-xs",
                            f.status === "incluido"
                              ? "bg-success text-success-foreground border-transparent"
                              : "bg-muted text-muted-foreground border-transparent",
                          )}
                          title={f.motivoExclusao}
                        >
                          {f.status === "incluido" ? "Incluído" : "Excluído"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="evidencias">
        {evidencias.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nenhuma evidência registrada ainda"
            description="Evidências com data/hora de acesso são anexadas às fontes e às capturas de sites deste processo."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {evidencias.map((e) => (
              <EvidenciaPanel
                key={e.id}
                nomeArquivo={e.nomeArquivo}
                dataHoraAcesso={e.dataHoraAcesso}
                url={e.url}
                observacoes={e.observacoes}
              />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="serie">
        {serie ? (
          <TabelaSeriePrecos serie={serie} />
        ) : (
          <EmptyState
            icon={FileText}
            title="Nenhum preço registrado ainda"
            description="A série de preços é consolidada a partir das fontes com evidência válida."
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
