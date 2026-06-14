import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { ProcessoFixture } from "@/lib/fixtures/processos";

const CLASSIFICACAO_LABEL: Record<ProcessoFixture["classificacao"], string> = {
  comum: "Comum",
  especifico: "Específico",
};

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function ProcessoHeader({ processo }: { processo: ProcessoFixture }) {
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/processos">
          <ArrowLeft className="size-4" aria-hidden />
          Voltar
        </Link>
      </Button>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            {processo.numero}
          </span>
          <StatusBadge status={processo.status} />
          <Badge variant="outline">{CLASSIFICACAO_LABEL[processo.classificacao]}</Badge>
        </div>

        <h1 className="text-2xl font-semibold">{processo.objeto}</h1>

        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Responsável:</dt>
            <dd>{processo.responsavel}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Abertura:</dt>
            <dd className="tabular-nums">{formatarData(processo.dataAbertura)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Quantidade:</dt>
            <dd className="tabular-nums">
              {processo.quantidade} {processo.unidade}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
