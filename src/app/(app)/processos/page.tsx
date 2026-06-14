import { SheetsBanner } from "@/components/processos/SheetsBanner";
import { ProcessosTable } from "@/components/processos/ProcessosTable";
import { PROCESSOS } from "@/lib/fixtures/processos";

export default function ProcessosPage() {
  const sheetsUrl = process.env.NEXT_PUBLIC_SHEETS_URL || undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Processos</h1>
        <p className="text-sm text-muted-foreground">
          Processos de pesquisa de preços (dados de exemplo).
        </p>
      </div>
      <SheetsBanner sheetsUrl={sheetsUrl} />
      <ProcessosTable processos={PROCESSOS} />
    </div>
  );
}
