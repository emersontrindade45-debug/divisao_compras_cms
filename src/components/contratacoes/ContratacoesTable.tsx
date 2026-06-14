"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ContratacaoFixture } from "@/lib/fixtures/contratacoes";
import type { StatusDominio } from "@/lib/domain/status";

const formatBRL = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDate = (iso: string) => {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
};

interface ContratacoesTableProps {
  contratacoes: ContratacaoFixture[];
  onCompare?: (items: ContratacaoFixture[]) => void;
  onClassificar?: (item: ContratacaoFixture) => void;
}

export function ContratacoesTable({ contratacoes, onCompare, onClassificar }: ContratacoesTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const COLUNAS: ColumnDef<ContratacaoFixture>[] = [
    {
      id: "select",
      header: "",
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="size-4 cursor-pointer accent-primary"
          checked={selectedIds.includes(row.original.id)}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedIds((prev) => [...prev, row.original.id]);
            } else {
              setSelectedIds((prev) => prev.filter((id) => id !== row.original.id));
            }
          }}
        />
      ),
    },
    {
      accessorKey: "numero",
      header: "Número",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.numero}</span>
      ),
    },
    {
      accessorKey: "orgao",
      header: "Órgão",
      cell: ({ row }) => (
        <span className="text-xs">{row.original.orgao}</span>
      ),
    },
    {
      accessorKey: "objeto",
      header: "Objeto",
      cell: ({ row }) => (
        <span className="text-xs line-clamp-2 max-w-[240px]">{row.original.objeto}</span>
      ),
    },
    {
      accessorKey: "modalidade",
      header: "Modalidade",
      cell: ({ row }) => (
        <span className="text-xs">{row.original.modalidade}</span>
      ),
    },
    {
      accessorKey: "valorUnitario",
      header: "Valor unitário",
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums">{formatBRL(row.original.valorUnitario)}</span>
      ),
    },
    {
      accessorKey: "dataContratacao",
      header: "Data",
      cell: ({ row }) => (
        <span className="text-xs">{formatDate(row.original.dataContratacao)}</span>
      ),
    },
    {
      accessorKey: "fonte",
      header: "Fonte",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs font-normal max-w-[160px] truncate">
          {row.original.fonte}
        </Badge>
      ),
    },
    {
      accessorKey: "aderencia",
      header: "Aderência",
      cell: ({ row }) => (
        <StatusBadge status={row.original.aderencia as StatusDominio} />
      ),
    },
    {
      id: "classificar",
      header: "",
      cell: ({ row }) =>
        onClassificar ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onClassificar(row.original)}
          >
            Classificar
          </Button>
        ) : null,
    },
  ];

  const selectedContratacoes = contratacoes.filter((c) => selectedIds.includes(c.id));

  return (
    <div className="space-y-3">
      {selectedIds.length === 2 && onCompare && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">2 itens selecionados</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onCompare(selectedContratacoes)}
          >
            Comparar selecionados
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds([])}
          >
            Limpar seleção
          </Button>
        </div>
      )}
      <DataTable
        columns={COLUNAS}
        data={contratacoes}
        filterPlaceholder="Filtrar contratações"
      />
    </div>
  );
}
