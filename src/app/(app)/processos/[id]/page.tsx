import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProcessoHeader } from "@/components/processos/ProcessoHeader";
import { ProcessoTabs } from "@/components/processos/ProcessoTabs";
import { getProcessoById } from "@/lib/fixtures/processos";

export default async function ProcessoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const processo = getProcessoById(id);

  if (!processo) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <AlertTriangle className="size-8 text-danger" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Processo não encontrado. Ele pode ter sido removido da planilha.
        </p>
        <Button render={<Link href="/processos" />} variant="outline" size="sm">
          Voltar para a lista
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProcessoHeader processo={processo} />
      <ProcessoTabs processo={processo} />
    </div>
  );
}
