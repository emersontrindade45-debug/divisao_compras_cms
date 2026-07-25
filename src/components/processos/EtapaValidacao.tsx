import { ClipboardCheck, MailQuestion } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusCotacaoBadge } from "@/components/cotacoes/StatusCotacaoBadge";
import { formatBRL, formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export interface CotacaoResumo {
  id: string;
  fornecedorRazaoSocial: string;
  dataEnvio: string;
  dataLimite: string;
  status: "positiva" | "negativa" | "incompleta" | "silenciosa";
  valorProposto?: number;
  propostaStatus?: "valida" | "com_ressalva" | "invalida";
}

const PROPOSTA_LABEL: Record<
  NonNullable<CotacaoResumo["propostaStatus"]>,
  { texto: string; classe: string }
> = {
  valida: {
    texto: "Válida",
    classe: "bg-success text-success-foreground border-transparent",
  },
  com_ressalva: {
    texto: "Com ressalva",
    classe: "bg-warning text-warning-foreground border-transparent",
  },
  invalida: {
    texto: "Inválida",
    classe: "bg-danger text-danger-foreground border-transparent",
  },
};

/**
 * Etapa ③ do fluxo: conferência das respostas recebidas.
 *
 * Mostra as cotações do processo com SLA e o resultado do checklist de cada
 * proposta, além dos não-respondentes — que a IN 65/2021 exige manter
 * registrados quando a pesquisa direta é usada (R-04).
 */
export function EtapaValidacao({ cotacoes }: { cotacoes: CotacaoResumo[] }) {
  if (cotacoes.length === 0) {
    return (
      <EmptyState
        icon={MailQuestion}
        title="Nenhuma cotação registrada neste processo"
        description="A validação de propostas se aplica quando há pesquisa direta com fornecedores. Registre cotações pela tela de Cotações."
      />
    );
  }

  const naoResponderam = cotacoes.filter((c) => c.status === "silenciosa");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="size-4" />
            Cotações e propostas ({cotacoes.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Envio</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Resposta</TableHead>
                <TableHead className="text-right">Valor proposto</TableHead>
                <TableHead>Proposta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cotacoes.map((c) => {
                const proposta = c.propostaStatus
                  ? PROPOSTA_LABEL[c.propostaStatus]
                  : undefined;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm font-medium">
                      {c.fornecedorRazaoSocial}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {formatDate(c.dataEnvio)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {formatDate(c.dataLimite)}
                    </TableCell>
                    <TableCell>
                      <StatusCotacaoBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {c.valorProposto !== undefined ? formatBRL(c.valorProposto) : "—"}
                    </TableCell>
                    <TableCell>
                      {proposta ? (
                        <Badge className={cn("text-xs", proposta.classe)}>
                          {proposta.texto}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Não avaliada
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {naoResponderam.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Fornecedores que não responderam ({naoResponderam.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="mb-2 text-sm text-muted-foreground">
              A IN 65/2021 exige que estes fornecedores constem do processo quando a
              pesquisa direta é utilizada.
            </p>
            <ul className="space-y-1 text-sm">
              {naoResponderam.map((c) => (
                <li key={c.id} className="flex justify-between gap-3 border-b py-1.5 last:border-0">
                  <span>{c.fornecedorRazaoSocial}</span>
                  <span className="tabular-nums text-muted-foreground">
                    prazo {formatDate(c.dataLimite)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
