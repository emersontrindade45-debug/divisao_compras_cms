"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { StatusDominio } from "@/lib/domain/status";

interface ProcessoMock {
  numero: string;
  objeto: string;
  responsavel: string;
  status: StatusDominio;
}

const DADOS: ProcessoMock[] = [
  { numero: "2026/001", objeto: "Aquisição de cadeiras ergonômicas", responsavel: "Ana", status: "aderente" },
  { numero: "2026/002", objeto: "Serviço de manutenção predial", responsavel: "Bruno", status: "pendente" },
  { numero: "2026/003", objeto: "Material de limpeza", responsavel: "Carla", status: "parcial" },
  { numero: "2026/004", objeto: "Licença de software de gestão", responsavel: "Diego", status: "nao-aderente" },
];

const COLUNAS: ColumnDef<ProcessoMock>[] = [
  { accessorKey: "numero", header: "Nº" },
  { accessorKey: "objeto", header: "Objeto" },
  { accessorKey: "responsavel", header: "Responsável" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

export default function ProcessosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Processos</h1>
        <p className="text-sm text-muted-foreground">Processos de pesquisa de preços (dados de exemplo).</p>
      </div>
      <DataTable columns={COLUNAS} data={DADOS} filterPlaceholder="Filtrar por objeto, responsável..." />
    </div>
  );
}
