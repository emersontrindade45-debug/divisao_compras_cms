import type { ReactNode } from "react";
import { Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { PesquisaSimilaridadeUploadForm } from "./PesquisaSimilaridadeUploadForm";
import { PreencherCotacaoForm } from "./PreencherCotacaoForm";
import { formatBRL, formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export interface FonteResumo {
  id: string;
  itemDescricao: string;
  tipo: "contratacao_publica" | "site_eletronico" | "fornecedor_direto";
  descricao: string;
  orgaoOuFornecedor: string;
  dataReferencia: string;
  valorUnitario: number;
  status: "incluido" | "excluido";
  motivoExclusao?: string;
  totalEvidencias: number;
}

const TIPO_FONTE_LABEL: Record<FonteResumo["tipo"], string> = {
  contratacao_publica: "Contratação pública",
  site_eletronico: "Site eletrônico",
  fornecedor_direto: "Fornecedor direto",
};

const TIPO_FONTE_BADGE: Record<FonteResumo["tipo"], string> = {
  contratacao_publica: "bg-primary/10 text-primary border-primary/20",
  site_eletronico:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  fornecedor_direto: "bg-muted text-muted-foreground",
};

function SecaoTitulo({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="space-y-0.5">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      <p className="text-xs text-muted-foreground">{descricao}</p>
    </div>
  );
}

/**
 * Etapa ② do fluxo: onde os preços são efetivamente descobertos e registrados.
 *
 * Reúne numa única etapa o que antes eram três abas separadas (similaridade,
 * fontes, evidências) — são ângulos da mesma atividade, e separá-las escondia a
 * relação entre a fonte e a evidência que a sustenta.
 */
export function EtapaPesquisa({
  processoId,
  fontes,
  fontesSimilaridade,
}: {
  processoId: string;
  fontes: FonteResumo[];
  fontesSimilaridade?: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SecaoTitulo
          titulo="Pesquisa por similaridade"
          descricao="Fonte prioritária pela IN 65/2021: contratações públicas comparáveis, a partir do TR e da planilha de itens."
        />
        <PesquisaSimilaridadeUploadForm processoId={processoId} />
        <PreencherCotacaoForm processoId={processoId} />
        {fontesSimilaridade}
      </section>

      <section className="space-y-3">
        <SecaoTitulo
          titulo={`Fontes registradas (${fontes.length})`}
          descricao="Preços já promovidos a fonte oficial deste processo, por item."
        />
        {fontes.length === 0 ? (
          <EmptyState
            icon={Globe}
            title="Nenhuma fonte registrada ainda"
            description="Promova resultados da pesquisa por similaridade ou registre fontes pelas telas de contratações, sites e cotações."
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Órgão / Fornecedor</TableHead>
                    <TableHead>Data ref.</TableHead>
                    <TableHead className="text-right">Valor unit.</TableHead>
                    <TableHead>Evidências</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fontes.map((f) => (
                    <TableRow key={f.id} className={cn(f.status === "excluido" && "opacity-50")}>
                      <TableCell className="max-w-40 truncate text-xs" title={f.itemDescricao}>
                        {f.itemDescricao}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-xs", TIPO_FONTE_BADGE[f.tipo])}>
                          {TIPO_FONTE_LABEL[f.tipo]}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-sm" title={f.descricao}>
                        {f.descricao}
                      </TableCell>
                      <TableCell className="text-sm">{f.orgaoOuFornecedor}</TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {formatDate(f.dataReferencia)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {formatBRL(f.valorUnitario)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-center text-sm tabular-nums",
                          f.status === "incluido" &&
                            f.totalEvidencias === 0 &&
                            "font-semibold text-danger",
                        )}
                        title={
                          f.status === "incluido" && f.totalEvidencias === 0
                            ? "Fonte sem evidência: preço não pode compor a estimativa (IN 65/2021)"
                            : undefined
                        }
                      >
                        {f.totalEvidencias}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "text-xs",
                            f.status === "incluido"
                              ? "bg-success text-success-foreground border-transparent"
                              : "bg-muted text-muted-foreground border-transparent",
                          )}
                          title={f.motivoExclusao}
                        >
                          {f.status === "incluido" ? "Incluído" : "Excluído"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
