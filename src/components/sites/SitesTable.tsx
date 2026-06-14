"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/DataTable";
import { SiteListaBadge } from "./SiteListaBadge";
import { Badge } from "@/components/ui/badge";
import type { SiteFixture } from "@/lib/fixtures/sites";

interface SitesTableProps {
  sites: SiteFixture[];
}

const COLUNAS: ColumnDef<SiteFixture>[] = [
  {
    accessorKey: "nome",
    header: "Nome",
    cell: ({ row }) => <span className="text-sm font-medium">{row.original.nome}</span>,
  },
  {
    accessorKey: "url",
    header: "URL",
    cell: ({ row }) => (
      <a
        href={row.original.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline-offset-4 hover:underline text-xs truncate max-w-[200px] block"
      >
        {row.original.url}
      </a>
    ),
  },
  {
    accessorKey: "lista",
    header: "Lista",
    cell: ({ row }) => <SiteListaBadge lista={row.original.lista} />,
  },
  {
    accessorKey: "categoria",
    header: "Categoria",
    cell: ({ row }) => <span className="text-xs">{row.original.categoria}</span>,
  },
  {
    accessorKey: "isMarketplace",
    header: "Marketplace",
    cell: ({ row }) =>
      row.original.isMarketplace ? (
        <Badge className="bg-danger text-danger-foreground border-transparent text-xs">
          Sim
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">Não</span>
      ),
  },
];

export function SitesTable({ sites }: SitesTableProps) {
  return (
    <DataTable
      columns={COLUNAS}
      data={sites}
      filterPlaceholder="Filtrar por nome ou URL"
    />
  );
}
