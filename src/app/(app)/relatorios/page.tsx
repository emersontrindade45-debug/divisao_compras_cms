import { BarChart3, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RelatorioResumoCard } from "@/components/relatorios/RelatorioResumoCard";
import { listarProcessosComSerie } from "@/lib/actions/listar";
import { PageHeader } from "@/components/common/PageHeader";

export default async function RelatoriosPage() {
  const processos = await listarProcessosComSerie();

  const processosComSerie = processos.filter((p) => {
    const serie = p.itens[0]?.seriePrecos[0];
    return serie && Number(serie.valorEstimado) > 0;
  });

  const processoSemSerie = processos.filter((p) => {
    const serie = p.itens[0]?.seriePrecos[0];
    return !serie || Number(serie.valorEstimado) === 0;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Relatório resumido, completo e memória de cálculo por processo."
      />

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
            Processos com série de preços consolidada ({processosComSerie.length} de {processos.length}).
          </p>
          {processosComSerie.map((p) => {
            const serie = p.itens[0]?.seriePrecos[0];
            return (
              <RelatorioResumoCard
                key={p.id}
                processo={p}
                serie={serie ? {
                  metodo: serie.metodo,
                  valorEstimado: Number(serie.valorEstimado),
                  precosIncluidos: serie.precosIncluidos,
                  totalPrecos: serie.totalPrecos,
                  coeficienteVariacao: Number(serie.coeficienteVariacao),
                } : undefined}
              />
            );
          })}
          {processoSemSerie.map((p) => (
            <RelatorioResumoCard key={p.id} processo={p} />
          ))}
          {processos.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum processo cadastrado.</p>
          )}
        </TabsContent>

        <TabsContent value="memoria" className="space-y-3">
          {processosComSerie.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum processo com série consolidada.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Memória de cálculo e série de preços de cada processo consolidado, prontas
                para instrução processual.
              </p>
              {processosComSerie.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium tabular-nums">{p.numero}</p>
                    <p className="truncate text-sm text-muted-foreground">{p.objeto}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <a
                      href={`/api/relatorios/${p.id}/pdf`}
                      download
                      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      <FileText className="size-3.5" />
                      PDF
                    </a>
                    <a
                      href={`/api/relatorios/${p.id}/xlsx`}
                      download
                      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      <FileText className="size-3.5" />
                      Excel
                    </a>
                  </div>
                </div>
              ))}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
