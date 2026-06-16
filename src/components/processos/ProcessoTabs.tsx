"use client";

import { FileText, Globe } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { TabelaSeriePrecos } from "@/components/cotacoes/TabelaSeriePrecos";
import { EstrategiaOrquestrador } from "./EstrategiaOrquestrador";
import { PesquisaSimilaridadeUploadForm } from "./PesquisaSimilaridadeUploadForm";
import type { ProcessoFixture } from "@/lib/fixtures/processos";
import { getSerieByProcessoId } from "@/lib/fixtures/seriePrecos";

export function ProcessoTabs({ processo }: { processo: ProcessoFixture }) {
  const serie = getSerieByProcessoId(processo.id);

  return (
    <Tabs defaultValue="estrategia" className="space-y-4">
      <TabsList>
        <TabsTrigger value="estrategia">Estratégia</TabsTrigger>
        <TabsTrigger value="similaridade">Pesquisa por Similaridade</TabsTrigger>
        <TabsTrigger value="fontes">Fontes</TabsTrigger>
        <TabsTrigger value="evidencias">Evidências</TabsTrigger>
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
      </TabsContent>

      <TabsContent value="fontes">
        <EmptyState
          icon={Globe}
          title="Nenhuma fonte registrada ainda"
          description="As fontes de preço serão adicionadas no módulo de fontes (M3)."
        />
      </TabsContent>

      <TabsContent value="evidencias">
        <EmptyState
          icon={FileText}
          title="Nenhuma evidência registrada ainda"
          description="Evidências com data/hora de acesso serão anexadas às fontes."
        />
      </TabsContent>

      <TabsContent value="serie">
        {serie ? (
          <TabelaSeriePrecos serie={serie} />
        ) : (
          <EmptyState
            icon={FileText}
            title="Nenhum preço registrado ainda"
            description="A série de preços é consolidada na aba de cotações."
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
