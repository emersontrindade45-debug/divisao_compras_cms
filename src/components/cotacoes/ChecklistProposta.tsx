"use client";

import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatBRL, formatDate } from "@/lib/formatters";
import type { PropostaFixture } from "@/lib/fixtures/cotacoes";

type StatusItem = "valido" | "ressalva" | "invalido";

const STATUS_ICON: Record<StatusItem, React.ReactNode> = {
  valido: <CheckCircle2 className="size-4 text-success shrink-0" />,
  ressalva: <AlertCircle className="size-4 text-warning shrink-0" />,
  invalido: <XCircle className="size-4 text-danger shrink-0" />,
};

const STATUS_LABEL: Record<StatusItem, string> = {
  valido: "Válido",
  ressalva: "Com ressalva",
  invalido: "Inválido",
};

const GERAL_CONFIG: Record<
  PropostaFixture["statusGeral"],
  { label: string; className: string }
> = {
  valida: { label: "Proposta válida", className: "bg-success text-success-foreground border-transparent" },
  "com-ressalva": { label: "Com ressalva", className: "bg-warning text-warning-foreground border-transparent" },
  invalida: { label: "Proposta inválida", className: "bg-danger text-danger-foreground border-transparent" },
};

interface ItemChecklistProps {
  label: string;
  status: StatusItem;
  valor?: string;
}

function ItemChecklist({ label, status, valor }: ItemChecklistProps) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      {STATUS_ICON[status]}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {valor && <p className="text-xs text-muted-foreground truncate">{valor}</p>}
      </div>
      <span
        className={cn(
          "text-xs font-medium shrink-0",
          status === "valido" && "text-success",
          status === "ressalva" && "text-warning",
          status === "invalido" && "text-danger",
        )}
      >
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}

export function ChecklistProposta({ proposta }: { proposta: PropostaFixture }) {
  const geral = GERAL_CONFIG[proposta.statusGeral];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">
          Checklist de validade — {proposta.fornecedorRazaoSocial}
        </CardTitle>
        <Badge className={geral.className}>{geral.label}</Badge>
      </CardHeader>
      <CardContent className="px-6 pb-4">
        <div className="divide-y">
          <ItemChecklist
            label="CNPJ do fornecedor"
            status={proposta.cnpjValido}
          />
          <ItemChecklist
            label="Descrição do produto/serviço"
            status={proposta.descricaoValida}
          />
          <ItemChecklist
            label="Valor unitário"
            status={proposta.valorUnitarioValido}
            valor={proposta.valorUnitario != null ? formatBRL(proposta.valorUnitario) : undefined}
          />
          <ItemChecklist
            label="Valor total"
            status={proposta.valorTotalValido}
            valor={proposta.valorTotal != null ? formatBRL(proposta.valorTotal) : undefined}
          />
          <ItemChecklist
            label="Data da proposta"
            status={proposta.dataValida}
            valor={proposta.dataProposta ? formatDate(proposta.dataProposta) : undefined}
          />
          <ItemChecklist
            label="Responsável identificado"
            status={proposta.responsavelValido}
            valor={proposta.responsavel}
          />
        </div>
        {proposta.observacoes && (
          <div className="mt-3 rounded-md bg-warning/10 border border-warning/30 px-3 py-2">
            <p className="text-xs text-warning-foreground font-medium">Observação</p>
            <p className="text-xs text-muted-foreground mt-0.5">{proposta.observacoes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
