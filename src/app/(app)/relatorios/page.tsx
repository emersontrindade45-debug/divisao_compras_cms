import { BarChart3, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RelatorioResumoCard } from "@/components/relatorios/RelatorioResumoCard";
import { listarProcessosComSerie } from "@/lib/actions/listar";

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

  const primeiroComSerie = processosComSerie[0];
  const seriePrimeiro = primeiroComSerie?.itens[0]?.seriePrecos[0];

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

        <TabsContent value="memoria">
          {primeiroComSerie && seriePrimeiro ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Exibindo memória de cálculo do processo mais recente com série consolidada.
                Use os botões de exportação para baixar o PDF.
              </p>
              <div className="rounded-md border bg-muted/30 p-6 text-center space-y-3">
                <p className="font-medium">{primeiroComSerie.numero}</p>
                <p className="text-sm text-muted-foreground">{primeiroComSerie.objeto}</p>
                <div className="flex justify-center gap-2">
                  <a
                    href={`/api/relatorios/${primeiroComSerie.id}/pdf`}
                    download
                    className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    <FileText className="size-3.5" />
                    Baixar PDF
                  </a>
                  <a
                    href={`/api/relatorios/${primeiroComSerie.id}/xlsx`}
                    download
                    className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    <FileText className="size-3.5" />
                    Baixar Excel
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum processo com série consolidada.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
