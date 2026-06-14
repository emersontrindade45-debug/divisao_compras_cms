"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/DataTable";
import type { CapturaFixture } from "@/lib/fixtures/capturas";
import type { SiteFixture } from "@/lib/fixtures/sites";
import { formatBRL, formatDataHora } from "@/lib/formatters";

interface CapturasTableProps {
  capturas: CapturaFixture[];
  sites: SiteFixture[];
}

export function CapturasTable({ capturas, sites }: CapturasTableProps) {
  const COLUNAS: ColumnDef<CapturaFixture>[] = [
    {
      id: "site",
      header: "Site",
      cell: ({ row }) => {
        const site = sites.find((s) => s.id === row.original.siteId);
        return <span className="text-xs font-medium">{site?.nome ?? row.original.siteId}</span>;
      },
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
        <span className="font-mono text-xs text-muted-foreground">{row.original.evidencia}</span>
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
