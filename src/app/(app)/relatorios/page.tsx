import { BarChart3, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RelatorioResumoCard } from "@/components/relatorios/RelatorioResumoCard";
import { MemoriaCalculo } from "@/components/relatorios/MemoriaCalculo";
import { PROCESSOS } from "@/lib/fixtures/processos";
import { getSerieByProcessoId } from "@/lib/fixtures/seriePrecos";

const PROCESSOS_COM_SERIE = PROCESSOS.filter((p) => getSerieByProcessoId(p.id) !== undefined);
const PROCESSO_DEMO = PROCESSOS_COM_SERIE[0];
const SERIE_DEMO = getSerieByProcessoId(PROCESSO_DEMO?.id ?? "");

export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Relatório resumido, completo e memória de cálculo por processo.
        </p>
      </div>

      <Tabs defaultValue="resumo" className="space-y-4">
        <TabsList>
          <TabsTrigger value="resumo" className="gap-2">
            <BarChart3 className="size-3.5" />
            Visão geral
          </TabsTrigger>
          <TabsTrigger value="memoria" className="gap-2">
            <FileText className="size-3.5" />
            Memória de cálculo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Processos com série de preços consolidada ({PROCESSOS_COM_SERIE.length} de {PROCESSOS.length}).
          </p>
          {PROCESSOS_COM_SERIE.map((p) => (
            <RelatorioResumoCard
              key={p.id}
              processo={p}
              serie={getSerieByProcessoId(p.id)}
            />
          ))}
          {PROCESSOS.filter((p) => !getSerieByProcessoId(p.id)).map((p) => (
            <RelatorioResumoCard key={p.id} processo={p} />
          ))}
        </TabsContent>

        <TabsContent value="memoria">
          {PROCESSO_DEMO && SERIE_DEMO ? (
            <MemoriaCalculo processo={PROCESSO_DEMO} serie={SERIE_DEMO} />
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum processo com série consolidada.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
