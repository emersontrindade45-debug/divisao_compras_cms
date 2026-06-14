"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/DataTable";
import { ScoreBadge } from "./ScoreBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FornecedorFixture } from "@/lib/fixtures/fornecedores";

const formatPercent = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(
    value / 100,
  );

interface FornecedoresTableProps {
  fornecedores: FornecedorFixture[];
  onVerHistorico: (f: FornecedorFixture) => void;
}

export function FornecedoresTable({ fornecedores, onVerHistorico }: FornecedoresTableProps) {
  const columns = useMemo<ColumnDef<FornecedorFixture>[]>(
    () => [
      {
        accessorKey: "cnpj",
        header: "CNPJ",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.cnpj}</span>
        ),
      },
      {
        accessorKey: "razaoSocial",
        header: "Razão Social",
        cell: ({ row }) => (
          <div>
            <span className="text-sm font-medium">{row.original.razaoSocial}</span>
            {row.original.nomeFantasia && (
              <p className="text-xs text-muted-foreground">{row.original.nomeFantasia}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "categoria",
        header: "Categoria",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1 max-w-[180px]">
            {row.original.categoria.map((cat) => (
              <Badge key={cat} variant="outline" className="text-xs font-normal">
                {cat}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: "contato",
        header: "Contato",
        cell: ({ row }) => (
          <div>
            <span className="text-sm">{row.original.responsavelContato}</span>
            <p className="text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        ),
      },
      {
        id: "cidadeUf",
        header: "Cidade/UF",
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.cidade}/{row.original.estado}
          </span>
        ),
      },
      {
        accessorKey: "score",
        header: "Score",
        cell: ({ row }) => <ScoreBadge score={row.original.score} />,
      },
      {
        accessorKey: "taxaResposta",
        header: "Taxa de resposta",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {formatPercent(row.original.taxaResposta)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            className={
              row.original.status === "ativo"
                ? "bg-success text-success-foreground border-transparent"
                : "bg-muted text-muted-foreground border-transparent"
            }
          >
            {row.original.status === "ativo" ? "Ativo" : "Inativo"}
          </Badge>
        ),
      },
      {
        id: "acoes",
        header: "",
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={() => onVerHistorico(row.original)}>
            Ver histórico
          </Button>
        ),
      },
    ],
    [onVerHistorico],
  );

  return (
    <DataTable
      columns={columns}
      data={fornecedores}
      filterPlaceholder="Filtrar por razão social ou CNPJ"
    />
  );
}
