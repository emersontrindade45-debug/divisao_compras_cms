"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { ContratacaoFixture } from "@/lib/fixtures/contratacoes";
import { formatBRL, formatDate } from "@/lib/formatters";

interface ComparadorContratacoesProps {
  items: ContratacaoFixture[];
  onClose: () => void;
}

interface LinhaComparador {
  label: string;
  renderCell: (item: ContratacaoFixture) => ReactNode;
}

const LINHAS: LinhaComparador[] = [
  { label: "Número", renderCell: (item) => <span className="font-mono text-xs">{item.numero}</span> },
  { label: "Órgão", renderCell: (item) => <span className="text-sm">{item.orgao}</span> },
  { label: "Objeto", renderCell: (item) => <span className="text-sm">{item.objeto}</span> },
  { label: "Modalidade", renderCell: (item) => <span className="text-sm">{item.modalidade}</span> },
  {
    label: "Valor unitário",
    renderCell: (item) => (
      <span className="font-mono text-sm tabular-nums font-semibold">
        {formatBRL(item.valorUnitario)}
      </span>
    ),
  },
  {
    label: "Quantidade",
    renderCell: (item) => (
      <span className="text-sm">
        {item.quantidade} {item.unidade}
      </span>
    ),
  },
  { label: "Data", renderCell: (item) => <span className="text-sm">{formatDate(item.dataContratacao)}</span> },
  { label: "Fonte", renderCell: (item) => <span className="text-sm">{item.fonte}</span> },
  {
    label: "Aderência",
    renderCell: (item) => <StatusBadge status={item.aderencia} />,
  },
];

export function ComparadorContratacoes({ items, onClose }: ComparadorContratacoesProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Comparação de contratações</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left text-xs font-medium text-muted-foreground w-32">
                  Campo
                </th>
                {items.map((item) => (
                  <th key={item.id} className="py-2 px-4 text-left text-xs font-medium">
                    {item.numero}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LINHAS.map((linha) => (
                <tr key={linha.label} className="border-b last:border-0">
                  <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground">
                    {linha.label}
                  </td>
                  {items.map((item) => (
                    <td key={item.id} className="py-2.5 px-4">
                      {linha.renderCell(item)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
