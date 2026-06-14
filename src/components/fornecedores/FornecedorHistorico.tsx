import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ScoreBadge } from "./ScoreBadge";
import type {
  FornecedorFixture,
  HistoricoCotacaoFixture,
} from "@/lib/fixtures/fornecedores";

const formatBRL = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDate = (iso: string) => {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
};

interface StatusRespostaConfig {
  label: string;
  className: string;
}

const STATUS_RESPOSTA_CONFIG: Record<
  HistoricoCotacaoFixture["statusResposta"],
  StatusRespostaConfig
> = {
  respondido: {
    label: "Respondido",
    className: "bg-success text-success-foreground border-transparent",
  },
  "nao-respondido": {
    label: "Não respondido",
    className: "bg-muted text-muted-foreground border-transparent",
  },
  recusado: {
    label: "Recusado",
    className: "bg-danger text-danger-foreground border-transparent",
  },
};

interface FornecedorHistoricoProps {
  fornecedor: FornecedorFixture;
  historico: HistoricoCotacaoFixture[];
}

export function FornecedorHistorico({ fornecedor, historico }: FornecedorHistoricoProps) {
  const taxaRespostaFormatada = new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(fornecedor.taxaResposta / 100);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">{fornecedor.razaoSocial}</CardTitle>
              {fornecedor.nomeFantasia && (
                <p className="text-sm text-muted-foreground">{fornecedor.nomeFantasia}</p>
              )}
              <p className="text-xs text-muted-foreground font-mono mt-1">{fornecedor.cnpj}</p>
            </div>
            <ScoreBadge score={fornecedor.score} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-semibold tabular-nums">{fornecedor.totalCotacoes}</p>
              <p className="text-xs text-muted-foreground">Cotações</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{fornecedor.totalRespostas}</p>
              <p className="text-xs text-muted-foreground">Respostas</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{taxaRespostaFormatada}</p>
              <p className="text-xs text-muted-foreground">Taxa de resposta</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Histórico de cotações</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Processo</TableHead>
                <TableHead className="text-xs">Data</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Valor proposto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">
                    Nenhuma cotação registrada.
                  </TableCell>
                </TableRow>
              ) : (
                historico.map((hc) => {
                  const config = STATUS_RESPOSTA_CONFIG[hc.statusResposta];
                  return (
                    <TableRow key={hc.id}>
                      <TableCell className="text-xs font-mono">{hc.processoNumero}</TableCell>
                      <TableCell className="text-xs">{formatDate(hc.data)}</TableCell>
                      <TableCell>
                        <Badge className={config.className}>{config.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {hc.valorProposto !== undefined ? formatBRL(hc.valorProposto) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
