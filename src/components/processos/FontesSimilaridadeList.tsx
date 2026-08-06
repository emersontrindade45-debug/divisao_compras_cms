import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/EmptyState";
import { PromoverFonteButton } from "@/components/processos/PromoverFonteButton";
import { DescartarResultadoButton } from "@/components/processos/DescartarResultadoButton";
import { SeletorNaturezaItem } from "@/components/processos/SeletorNaturezaItem";
import { obterFontesSimilaridade } from "@/lib/actions/listar";

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR");
}

function scoreVariant(score: number): "default" | "secondary" | "destructive" {
  if (score >= 70) return "default";
  if (score >= 40) return "secondary";
  return "destructive";
}

export async function FontesSimilaridadeList({ processoId }: { processoId: string }) {
  const itens = await obterFontesSimilaridade(processoId);
  const itensComFontes = itens.filter((item) => item.resultadosSimilaridade.length > 0);

  if (itensComFontes.length === 0) {
    return (
      <EmptyState
        icon={ExternalLink}
        title="Nenhuma fonte encontrada ainda"
        description="Faça a pesquisa por similaridade para localizar contratações públicas comprobatórias."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Fontes utilizadas no preenchimento da cotação, para comprovação junto ao auditor. Itens
        sem candidato suficientemente similar (score abaixo de 70) não aparecem aqui — exigem
        pesquisa direta com fornecedores.
      </p>
      {itensComFontes.map((item) => (
        <Card key={item.id} size="sm">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-medium leading-snug">{item.descricao}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {item.quantidade} {item.unidade}
              </p>
            </div>
            <SeletorNaturezaItem itemId={item.id} natureza={item.natureza} />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Órgão / Origem</TableHead>
                  <TableHead>Objeto do contrato</TableHead>
                  <TableHead>Valor unitário</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.resultadosSimilaridade.map((fonte) => (
                  <TableRow key={fonte.id}>
                    <TableCell className="whitespace-nowrap">{fonte.fonteOrgaoOuId}</TableCell>
                    <TableCell className="max-w-xs truncate" title={fonte.fonteDescricao}>
                      {fonte.fonteDescricao}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono tabular-nums">
                      {formatarMoeda(Number(fonte.valorUnitario))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarData(fonte.dataReferencia)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={scoreVariant(Number(fonte.scoreFinal))}>
                        {Number(fonte.scoreFinal).toFixed(0)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {fonte.fonteUrl ? (
                        <a
                          href={fonte.fonteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Abrir <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <PromoverFonteButton
                          resultadoId={fonte.id}
                          jaPromovido={fonte.promovidoParaFonte}
                        />
                        {!fonte.promovidoParaFonte && (
                          <DescartarResultadoButton resultadoId={fonte.id} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
