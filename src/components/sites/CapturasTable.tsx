"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/DataTable";
import { formatBRL, formatDataHora } from "@/lib/formatters";

export interface CapturaRow {
  id: string;
  siteNome: string;
  processoId: string;
  processoNumero: string;
  processoObjeto: string;
  url: string;
  produto: string;
  valorUnitario: number;
  dataHoraAcesso: string;
  evidencia?: string;
}

interface CapturasTableProps {
  capturas: CapturaRow[];
}

export function CapturasTable({ capturas }: CapturasTableProps) {
  const COLUNAS: ColumnDef<CapturaRow>[] = [
    {
      accessorKey: "processoNumero",
      header: "Processo",
      cell: ({ row }) => (
        <Link
          href={`/processos/${row.original.processoId}`}
          className="text-xs font-mono text-primary underline-offset-4 hover:underline"
          title={row.original.processoObjeto}
        >
          {row.original.processoNumero}
        </Link>
      ),
    },
    {
      accessorKey: "siteNome",
      header: "Site",
      cell: ({ row }) => <span className="text-xs font-medium">{row.original.siteNome}</span>,
    },
    {
      accessorKey: "produto",
      header: "Produto",
      cell: ({ row }) => (
        <span className="text-xs line-clamp-2 max-w-[200px]">{row.original.produto}</span>
      ),
    },
    {
      accessorKey: "valorUnitario",
      header: "Valor unitário",
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums">
          {formatBRL(row.original.valorUnitario)}
        </span>
      ),
    },
    {
      accessorKey: "dataHoraAcesso",
      header: "Data/Hora",
      cell: ({ row }) => (
        <span className="text-xs">{formatDataHora(row.original.dataHoraAcesso)}</span>
      ),
    },
    {
      accessorKey: "evidencia",
      header: "Evidência",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.evidencia ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={COLUNAS}
      data={capturas}
      filterPlaceholder="Filtrar capturas"
    />
  );
}
