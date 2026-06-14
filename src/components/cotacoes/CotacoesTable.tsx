"use client";

import { useState } from "react";
import { Bell, Eye } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/DataTable";
import { Button } from "@/components/ui/button";
import { StatusCotacaoBadge } from "./StatusCotacaoBadge";
import { formatBRL, formatDate } from "@/lib/formatters";
import type { CotacaoFixture } from "@/lib/fixtures/cotacoes";
import { cn } from "@/lib/utils";

function SlaIndicator({ diasRestantes }: { diasRestantes: number }) {
  const vencido = diasRestantes < 0;
  const urgente = diasRestantes >= 0 && diasRestantes <= 3;
  return (
    <span
      className={cn(
        "tabular-nums text-sm",
        vencido && "text-danger font-medium",
        urgente && "text-warning font-medium",
        !vencido && !urgente && "text-muted-foreground",
      )}
    >
      {vencido ? `Vencido (${Math.abs(diasRestantes)}d)` : `${diasRestantes}d restantes`}
    </span>
  );
}

const columns: ColumnDef<CotacaoFixture>[] = [
  {
    accessorKey: "processoNumero",
    header: "Processo",
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.original.processoNumero}</span>
    ),
  },
  {
    accessorKey: "fornecedorRazaoSocial",
    header: "Fornecedor",
    cell: ({ row }) => (
      <div>
        <p className="text-sm font-medium leading-snug">{row.original.fornecedorRazaoSocial}</p>
        <p className="text-xs text-muted-foreground">{row.original.fornecedorEmail}</p>
      </div>
    ),
  },
  {
    accessorKey: "dataEnvio",
    header: "Envio",
    cell: ({ row }) => (
      <span className="tabular-nums text-sm text-muted-foreground">
        {formatDate(row.original.dataEnvio)}
      </span>
    ),
  },
  {
    accessorKey: "dataLimite",
    header: "Prazo",
    cell: ({ row }) => (
      <span className="tabular-nums text-sm">{formatDate(row.original.dataLimite)}</span>
    ),
  },
  {
    accessorKey: "diasRestantes",
    header: "SLA",
    cell: ({ row }) => <SlaIndicator diasRestantes={row.original.diasRestantes} />,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusCotacaoBadge status={row.original.status} />,
  },
  {
    accessorKey: "valorProposto",
    header: "Valor proposto",
    cell: ({ row }) =>
      row.original.valorProposto != null ? (
        <span className="tabular-nums text-sm font-medium">
          {formatBRL(row.original.valorProposto)}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      ),
  },
  {
    id: "acoes",
    header: "",
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        {(row.original.status === "silenciosa" || row.original.status === "incompleta") &&
          !row.original.lembreteEnviado && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
              <Bell className="size-3" />
              Lembrar
            </Button>
          )}
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
          <Eye className="size-3" />
          Ver
        </Button>
      </div>
    ),
  },
];

export function CotacoesTable({ cotacoes }: { cotacoes: CotacaoFixture[] }) {
  const [data] = useState(cotacoes);
  return (
    <DataTable
      columns={columns}
      data={data}
      filterPlaceholder="Filtrar por processo ou fornecedor…"
    />
  );
}
