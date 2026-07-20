import { ExternalLink, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/EmptyState";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { obterFontesSimilaridade } from "@/lib/actions/listar";
import { PalavrasChaveItemForm } from "./PalavrasChaveItemForm";

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR");
}

// Score ≥ 85: verde (acima do mínimo aceitável)
// Score ≥ 70: âmbar (abaixo do mínimo atual, mas com alguma relação)
// Score < 70: vermelho (fraca relação)
function scoreVariant(score: number): "default" | "secondary" | "destructive" {
  if (score >= 85) return "default";
  if (score >= 70) return "secondary";
  return "destructive";
}

function ScoreBreakdown({
  scoreFinal,
  scoreDescricao,
  scoreEspecificacao,
  scoreUnidadeQuantidade,
  justificativa,
  adaptado,
}: {
  scoreFinal: number;
  scoreDescricao: number;
  scoreEspecificacao: number;
  scoreUnidadeQuantidade: number;
  justificativa: string;
  adaptado: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<button type="button" className="cursor-help" />}>
          <Badge variant={scoreVariant(scoreFinal)} className="tabular-nums">
            {scoreFinal.toFixed(0)}
            {adaptado && <span className="ml-1 opacity-70">~</span>}
          </Badge>
        </TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-2 text-xs p-3">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <span className="text-muted-foreground">Descrição</span>
          <span className="font-medium tabular-nums">{scoreDescricao.toFixed(0)}</span>
          <span className="text-muted-foreground">Especificação</span>
          <span className="font-medium tabular-nums">{scoreEspecificacao.toFixed(0)}</span>
          <span className="text-muted-foreground">Unidade/Qtde</span>
          <span className="font-medium tabular-nums">{scoreUnidadeQuantidade.toFixed(0)}</span>
        </div>
        {adaptado && (
          <p className="text-amber-600 dark:text-amber-400 flex items-start gap-1">
            <AlertCircle className="size-3 mt-0.5 shrink-0" />
            Unidade adaptada — aplicar conversão manual antes de usar o valor.
          </p>
        )}
        {justificativa && (
          <p className="text-muted-foreground border-t pt-2">{justificativa}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export async function FontesSimilaridadeList({ processoId }: { processoId: string }) {
  let itens: Awaited<ReturnType<typeof obterFontesSimilaridade>>;
  try {
    itens = await obterFontesSimilaridade(processoId);
  } catch {
    return (
      <EmptyState
        icon={ExternalLink}
        title="Não foi possível carregar as fontes"
        description="Ocorreu um erro ao buscar as fontes de similaridade. Tente recarregar a página."
      />
    );
  }

  if (itens.length === 0) {
    return (
      <EmptyState
        icon={ExternalLink}
        title="Nenhuma fonte encontrada ainda"
        description="Faça a pesquisa por similaridade para localizar contratações públicas comprobatórias."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Contratos públicos similares encontrados. Score ≥ 85 = verde (aceito). Score entre 70–84 = âmbar
        (revisar). Score &lt; 70 = vermelho (inadequado). Clique no score para ver o detalhamento.
      </p>
      {itens.map((item) => (
        <Card key={item.id} size="sm">
          <CardHeader className="space-y-2">
            <div>
              <CardTitle className="text-sm font-medium leading-snug">{item.descricao}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.quantidade} {item.unidade}
              </p>
            </div>
            <PalavrasChaveItemForm
              itemId={item.id}
              defaultPalavras={item.palavrasChave}
            />
          </CardHeader>
          <CardContent>
            {item.resultadosSimilaridade.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                Nenhum contrato similar encontrado com score ≥ 85. Defina termos de busca
                específicos acima e repita a pesquisa.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Órgão / Origem</TableHead>
                    <TableHead>Objeto do contrato</TableHead>
                    <TableHead>Valor unitário</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Score ①</TableHead>
                    <TableHead>Fonte</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {item.resultadosSimilaridade.map((fonte) => (
                    <TableRow key={fonte.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {fonte.fonteOrgaoOuId}
                      </TableCell>
                      <TableCell className="max-w-xs text-xs" title={fonte.fonteDescricao}>
                        <span className="line-clamp-2">{fonte.fonteDescricao}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono tabular-nums text-xs">
                        {formatarMoeda(Number(fonte.valorUnitario))}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatarData(fonte.dataReferencia)}
                      </TableCell>
                      <TableCell>
                        <ScoreBreakdown
                          scoreFinal={Number(fonte.scoreFinal)}
                          scoreDescricao={Number(fonte.scoreDescricao)}
                          scoreEspecificacao={Number(fonte.scoreEspecificacao)}
                          scoreUnidadeQuantidade={Number(fonte.scoreUnidadeQuantidade)}
                          justificativa={fonte.justificativa}
                          adaptado={fonte.adaptado}
                        />
                      </TableCell>
                      <TableCell>
                        {fonte.fonteUrl ? (
                          <a
                            href={fonte.fonteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Abrir <ExternalLink className="size-3" aria-hidden />
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground">
        ① Passe o cursor sobre o score para ver o detalhamento: Descrição (55%), Especificação (28%)
        e Unidade/Qtde (17%). O símbolo ~ indica que a unidade foi adaptada.
      </p>
    </div>
  );
}
