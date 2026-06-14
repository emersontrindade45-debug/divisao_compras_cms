"use client";

import { useState } from "react";
import { SITES } from "@/lib/fixtures/sites";
import { CAPTURAS } from "@/lib/fixtures/capturas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SitesTable } from "@/components/sites/SitesTable";
import { CapturasTable } from "@/components/sites/CapturasTable";
import { CapturaForm, type NovaCapturaData } from "@/components/sites/CapturaForm";

export default function SitesPage() {
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  function handleNovaCapturaSubmit(_data: NovaCapturaData) {
    setMostrarFormulario(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Sites admissíveis</h1>
        <p className="text-sm text-muted-foreground">
          Validação de sites com captura de data/hora e bloqueio de marketplaces.
        </p>
      </div>

      <Tabs defaultValue="sites">
        <TabsList>
          <TabsTrigger value="sites">Sites admissíveis</TabsTrigger>
          <TabsTrigger value="capturas">Capturas registradas</TabsTrigger>
        </TabsList>

        <TabsContent value="sites" className="space-y-4 pt-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            Somente sites da lista branca são admissíveis como fonte em pesquisa de preços. Sites
            da lista cinza requerem ressalva registrada. Sites da lista vermelha e marketplaces
            estão bloqueados conforme a IN SEGES/ME 65/2021.
          </div>
          <SitesTable sites={SITES} />
        </TabsContent>

        <TabsContent value="capturas" className="space-y-4 pt-2">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant={mostrarFormulario ? "outline" : "default"}
              onClick={() => setMostrarFormulario((prev) => !prev)}
            >
              {mostrarFormulario ? "Cancelar" : "Nova captura"}
            </Button>
          </div>

          {mostrarFormulario && (
            <CapturaForm
              sites={SITES}
              processoId="proc-001"
              onSubmit={handleNovaCapturaSubmit}
            />
          )}

          <CapturasTable capturas={CAPTURAS} sites={SITES} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
