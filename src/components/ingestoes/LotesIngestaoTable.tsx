import { Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/EmptyState";

export interface LoteIngestaoRow {
  id: string;
  fonteNome: string;
  fonteChave: string;
  competencia: string;
  urlArquivo: string;
  linhasLidas: number;
  linhasImportadas: number;
  linhasRejeitadas: number;
  iniciadoEm: string;
  concluidoEm: string | null;
  erro: string | null;
}

type StatusVariant = "success" | "warning" | "danger" | "neutral";

// Mesma paleta de `StatusBadge` (CLAUDE.md §5): status de ingestão não é um
// `StatusDominio` (aderência), então fica com sua própria pequena tabela em
// vez de forçar um valor estranho no enum de domínio compartilhado.
const VARIANT_CLASSES: Record<StatusVariant, string> = {
  success: "bg-success text-success-foreground border-transparent",
  warning: "bg-warning text-warning-foreground border-transparent",
  danger: "bg-danger text-danger-foreground border-transparent",
  neutral: "bg-muted text-muted-foreground border-transparent",
};

function statusDoLote(lote: LoteIngestaoRow): { label: string; variant: StatusVariant } {
  if (lote.erro) return { label: "Falhou", variant: "danger" };
  if (!lote.concluidoEm) return { label: "Em andamento", variant: "neutral" };
  if (lote.linhasRejeitadas > 0) return { label: "Concluído com rejeições", variant: "warning" };
  return { label: "Concluído", variant: "success" };
}

export function LotesIngestaoTable({ lotes }: { lotes: LoteIngestaoRow[] }) {
  if (lotes.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="Nenhuma ingestão registrada"
        description="O runner genérico de ingestão está pronto (M15); nenhuma fonte real foi ligada a ele ainda — SINAPI, CADTERC e CATMAT entram a partir do M16."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fonte</TableHead>
          <TableHead>Competência</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Lidas</TableHead>
          <TableHead className="text-right">Importadas</TableHead>
          <TableHead className="text-right">Rejeitadas</TableHead>
          <TableHead>Iniciado em</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lotes.map((lote) => {
          const status = statusDoLote(lote);
          return (
            <TableRow key={lote.id}>
              <TableCell className="font-medium">{lote.fonteNome}</TableCell>
              <TableCell>{lote.competencia}</TableCell>
              <TableCell>
                <Badge className={cn(VARIANT_CLASSES[status.variant])}>{status.label}</Badge>
                {lote.erro ? (
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">{lote.erro}</p>
                ) : null}
              </TableCell>
              <TableCell className="text-right tabular-nums">{lote.linhasLidas}</TableCell>
              <TableCell className="text-right tabular-nums">{lote.linhasImportadas}</TableCell>
              <TableCell className="text-right tabular-nums">{lote.linhasRejeitadas}</TableCell>
              <TableCell className="whitespace-nowrap">
                {new Date(lote.iniciadoEm).toLocaleString("pt-BR")}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
