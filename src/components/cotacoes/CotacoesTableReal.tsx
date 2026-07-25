"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/DataTable";
import { StatusCotacaoBadge } from "./StatusCotacaoBadge";
import { formatBRL } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { StatusCotacao } from "@prisma/client";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export interface CotacaoRow {
  id: string;
  processoNumero: string;
  fornecedorRazaoSocial: string;
  fornecedorEmail: string;
  dataEnvio: Date;
  dataLimite: Date;
  status: StatusCotacao;
  valorProposto: number | null;
  lembreteEnviado: boolean;
}

function SlaIndicator({ dataLimite }: { dataLimite: Date }) {
  const now = new Date();
  const diasRestantes = Math.ceil(
    (dataLimite.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
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

const columns: ColumnDef<CotacaoRow>[] = [
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
    id: "sla",
    header: "SLA",
    cell: ({ row }) => <SlaIndicator dataLimite={row.original.dataLimite} />,
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
    id: "lembrete",
    header: "Lembrete",
    // Informativo, não acionável: o envio de e-mail é feito pela Câmara fora do
    // sistema (CLAUDE.md §9.3) — a plataforma apenas registra o que ocorreu.
    cell: ({ row }) => {
      const aguardando =
        row.original.status === "silenciosa" || row.original.status === "incompleta";
      if (row.original.lembreteEnviado) {
        return (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <BellRing className="size-3 text-success" aria-hidden />
            Enviado
          </span>
        );
      }
      return (
        <span className="text-xs text-muted-foreground">
          {aguardando ? "Pendente" : "—"}
        </span>
      );
    },
  },
];

export function CotacoesTableReal({ cotacoes }: { cotacoes: CotacaoRow[] }) {
  const [data] = useState(cotacoes);
  return (
    <DataTable
      columns={columns}
      data={data}
      filterPlaceholder="Filtrar por processo ou fornecedor…"
    />
  );
}
