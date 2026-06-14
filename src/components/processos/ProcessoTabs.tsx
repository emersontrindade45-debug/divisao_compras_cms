"use client";

import { FileText, Globe, Layers } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import type { ProcessoFixture } from "@/lib/fixtures/processos";

function estrategiaTexto(processo: ProcessoFixture): string {
  if (processo.classificacao === "comum") {
    return "Item comum: priorize contratações públicas similares e sites admissíveis, com cotação direta apenas como complemento.";
  }
  return "Item específico: priorize cotação direta com fornecedores qualificados e contratações públicas similares; sites tendem a ter menor aderência.";
}

export function ProcessoTabs({ processo }: { processo: ProcessoFixture }) {
  return (
    <Tabs defaultValue="estrategia" className="space-y-4">
      <TabsList>
        <TabsTrigger value="estrategia">Estratégia</TabsTrigger>
        <TabsTrigger value="fontes">Fontes</TabsTrigger>
        <TabsTrigger value="evidencias">Evidências</TabsTrigger>
        <TabsTrigger value="serie">Série de preços</TabsTrigger>
      </TabsList>

      <TabsContent value="estrategia">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ordem de busca recomendada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{estrategiaTexto(processo)}</p>
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
        <EmptyState
          icon={Layers}
          title="Nenhum preço registrado ainda"
          description="A série de preços será consolidada no módulo de cotações (M4)."
        />
      </TabsContent>
    </Tabs>
  );
}
