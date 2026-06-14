import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProcessoHeader } from "@/components/processos/ProcessoHeader";
import { ProcessoTabs } from "@/components/processos/ProcessoTabs";
import { obterProcessoDetalhado } from "@/lib/actions/listar";
import type { ProcessoFixture } from "@/lib/fixtures/processos";
import type { StatusDominio } from "@/lib/domain/status";

const STATUS_MAP: Record<string, StatusDominio> = {
  aderente: "aderente",
  parcial: "parcial",
  nao_aderente: "nao-aderente",
  pendente: "pendente",
};

export default async function ProcessoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const processo = await obterProcessoDetalhado(id);

  if (!processo) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <AlertTriangle className="size-8 text-danger" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Processo não encontrado. Ele pode ter sido removido.
        </p>
        <Button render={<Link href="/processos" />} variant="outline" size="sm">
          Voltar para a lista
        </Button>
      </div>
    );
  }

  const processoMapeado: ProcessoFixture = {
    id: processo.id,
    numero: processo.numero,
    objeto: processo.objeto,
    unidade: processo.unidade,
    quantidade: processo.quantidade,
    caracteristicasTecnicas: processo.caracteristicasTecnicas,
    palavrasChave: processo.palavrasChave,
    classificacao: processo.classificacao === "especifico" ? "especifico" : "comum",
    responsavel: processo.responsavel,
    status: STATUS_MAP[processo.status] ?? "pendente",
    dataAbertura: processo.dataAbertura.toISOString().slice(0, 10),
  };

  return (
    <div className="space-y-6">
      <ProcessoHeader processo={processoMapeado} />
      <ProcessoTabs processo={processoMapeado} />
    </div>
  );
}
