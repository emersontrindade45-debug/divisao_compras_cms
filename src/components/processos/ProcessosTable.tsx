"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderSearch } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
import {
  ProcessoFilters,
  type FiltrosProcesso,
} from "@/components/processos/ProcessoFilters";
import { filtrarProcessos } from "@/lib/domain/processoFilter";
import type { ProcessoFixture } from "@/lib/fixtures/processos";

const FILTROS_INICIAIS: FiltrosProcesso = {
  busca: "",
  status: "todos",
  responsavel: "todos",
  dataInicio: "",
  dataFim: "",
};

const CLASSIFICACAO_LABEL: Record<ProcessoFixture["classificacao"], string> = {
  comum: "Comum",
  especifico: "Específico",
};

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

const COLUNAS: ColumnDef<ProcessoFixture>[] = [
  {
    accessorKey: "numero",
    header: "Nº",
    cell: ({ row }) => (
      <Link
        href={`/processos/${row.original.id}`}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {row.original.numero}
      </Link>
    ),
  },
  { accessorKey: "objeto", header: "Objeto" },
  {
    accessorKey: "classificacao",
    header: "Classificação",
    cell: ({ row }) => (
      <Badge variant="outline">{CLASSIFICACAO_LABEL[row.original.classificacao]}</Badge>
    ),
  },
  { accessorKey: "responsavel", header: "Responsável" },
  {
    accessorKey: "dataAbertura",
    header: "Abertura",
    cell: ({ row }) => (
      <span className="tabular-nums">{formatarData(row.original.dataAbertura)}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

export function ProcessosTable({ processos }: { processos: ProcessoFixture[] }) {
  const [filtros, setFiltros] = useState<FiltrosProcesso>(FILTROS_INICIAIS);

  const responsaveis = useMemo(
    () =>
      Array.from(new Set(processos.map((p) => p.responsavel))).sort((a, b) =>
        a.localeCompare(b, "pt-BR")
      ),
    [processos]
  );

  const filtrados = useMemo(() => filtrarProcessos(processos, filtros), [processos, filtros]);

  return (
    <div className="space-y-4">
      <ProcessoFilters filtros={filtros} responsaveis={responsaveis} onChange={setFiltros} />
      {filtrados.length ? (
        <DataTable columns={COLUNAS} data={filtrados} />
      ) : (
        <EmptyState
          icon={FolderSearch}
          title="Nenhum processo encontrado"
          description="Ajuste os filtros para ver mais resultados."
        />
      )}
    </div>
  );
}
