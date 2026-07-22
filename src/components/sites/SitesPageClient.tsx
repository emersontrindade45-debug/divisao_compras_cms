"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SitesTable } from "@/components/sites/SitesTable";
import { CapturasTable, type CapturaRow } from "@/components/sites/CapturasTable";
import {
  CapturaForm,
  type NovaCapturaData,
  type ProcessoOption,
} from "@/components/sites/CapturaForm";
import { criarCaptura } from "@/lib/actions/sites";
import type { SiteFixture } from "@/lib/fixtures/sites";

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/50 max-w-72";

interface SitesPageClientProps {
  sites: SiteFixture[];
  capturas: CapturaRow[];
  processos: ProcessoOption[];
}

export function SitesPageClient({ sites, capturas, processos }: SitesPageClientProps) {
  const router = useRouter();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [filtroProcessoId, setFiltroProcessoId] = useState("");

  const capturasFiltradas = filtroProcessoId
    ? capturas.filter((c) => c.processoId === filtroProcessoId)
    : capturas;

  async function handleNovaCapturaSubmit(data: NovaCapturaData) {
    const result = await criarCaptura({
      ...data,
      dataHoraAcesso: new Date(data.dataHoraAcesso),
      evidencia: data.evidencia || undefined,
    });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Captura registrada com data/hora de acesso.");
    setMostrarFormulario(false);
    router.refresh();
  }

  return (
    <Tabs defaultValue="capturas">
      <TabsList>
        <TabsTrigger value="capturas">Evidências por processo</TabsTrigger>
        <TabsTrigger value="sites">Sites admissíveis</TabsTrigger>
      </TabsList>

      <TabsContent value="capturas" className="space-y-4 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <select
            className={SELECT_CLASS}
            value={filtroProcessoId}
            onChange={(e) => setFiltroProcessoId(e.target.value)}
            aria-label="Filtrar por processo"
          >
            <option value="">Todos os processos</option>
            {processos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.numero} — {p.objeto}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant={mostrarFormulario ? "outline" : "default"}
            onClick={() => setMostrarFormulario((prev) => !prev)}
          >
            {mostrarFormulario ? "Cancelar" : "Nova captura"}
          </Button>
        </div>

        {mostrarFormulario && (
          <CapturaForm sites={sites} processos={processos} onSubmit={handleNovaCapturaSubmit} />
        )}

        <CapturasTable capturas={capturasFiltradas} />
      </TabsContent>

      <TabsContent value="sites" className="space-y-4 pt-2">
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Somente sites da lista branca são admissíveis como fonte em pesquisa de preços. Sites
          da lista cinza requerem ressalva registrada. Sites da lista vermelha e marketplaces
          estão bloqueados conforme a IN SEGES/ME 65/2021.
        </div>
        <SitesTable sites={sites} />
      </TabsContent>
    </Tabs>
  );
}
