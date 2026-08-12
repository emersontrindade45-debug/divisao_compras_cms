import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/EmptyState";
import { SeletorNaturezaItem } from "@/components/processos/SeletorNaturezaItem";
import { ParametrosTRItem } from "@/components/processos/ParametrosTRItem";
import {
  LinhaCandidatoSimilaridade,
  type CandidatoSimilaridadeView,
} from "@/components/processos/LinhaCandidatoSimilaridade";
import { obterFontesSimilaridade } from "@/lib/actions/listar";
import { lerRoteiro } from "@/lib/validations/roteiroCalculo";
import {
  classificarGrandeza,
  grandezasDivergentes,
  type ParametrosTR,
  type PeriodicidadeContrato,
} from "@/lib/domain/roteiroCalculo";


function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR");
}

/** `Decimal` do Prisma não atravessa a fronteira RSC — converte ou devolve null. */
function paraNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  return Number(valor);
}

type ItemDoBanco = Awaited<ReturnType<typeof obterFontesSimilaridade>>[number];
type ResultadoDoBanco = ItemDoBanco["resultadosSimilaridade"][number];

function paraView(fonte: ResultadoDoBanco): CandidatoSimilaridadeView {
  return {
    id: fonte.id,
    tipoCandidato: fonte.tipoCandidato,
    fonteDescricao: fonte.fonteDescricao,
    fonteOrgaoOuId: fonte.fonteOrgaoOuId,
    fonteUrl: fonte.fonteUrl,
    valorUnitario: Number(fonte.valorUnitario),
    dataFormatada: formatarData(fonte.dataReferencia),
    dataReferenciaISO: fonte.dataReferencia.toISOString(),
    scoreFinal: Number(fonte.scoreFinal),
    promovidoParaFonte: fonte.promovidoParaFonte,
    competenciaReferencia: fonte.competenciaReferencia,
    regimeReferencia: fonte.regimeReferencia,
    localidadeReferencia: fonte.localidadeReferencia,
    ajusteUnidadeMedida: fonte.ajusteUnidadeMedida ?? null,
    ajustePeriodicidade: (fonte.ajustePeriodicidade as PeriodicidadeContrato | null) ?? null,
    valorConsiderado: paraNumero(fonte.valorConsiderado),
    // A coluna é `Json` e o Prisma não tipa o conteúdo — validar na leitura
    // (CLAUDE.md §9.12). Roteiro inválido vira null e o candidato aparece pelo
    // valor cru, em vez de derrubar a tela inteira.
    roteiro: lerRoteiro(fonte.roteiroCalculo),
  };
}

function parametrosTRdoItem(item: ItemDoBanco): ParametrosTR {
  return {
    medida: paraNumero(item.trMedida),
    medidaUnidade: item.trMedidaUnidade,
    quantidade: item.quantidade,
    unidade: item.unidade,
    frequencia: item.trFrequencia,
    vigenciaMeses: item.trVigenciaMeses,
  };
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
      {itensComFontes.map((item) => {
        const candidatos = item.resultadosSimilaridade.map(paraView);
        const tr = parametrosTRdoItem(item);
        const grandezas = candidatos.map((c) =>
          c.roteiro ? classificarGrandeza(c.roteiro.passos) : null,
        );

        return (
          <Card key={item.id} size="sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-medium leading-snug">{item.descricao}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {item.quantidade} {item.unidade}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <ParametrosTRItem
                  itemId={item.id}
                  quantidade={item.quantidade}
                  unidade={item.unidade}
                  trMedida={tr.medida}
                  trMedidaUnidade={tr.medidaUnidade}
                  trFrequencia={tr.frequencia}
                  trVigenciaMeses={tr.vigenciaMeses}
                />
                <SeletorNaturezaItem itemId={item.id} natureza={item.natureza} />
              </div>
            </CardHeader>
            <CardContent>
              {grandezasDivergentes(grandezas) && (
                <p className="mb-2 rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning-foreground ring-1 ring-warning/30">
                  Os candidatos deste item terminam em grandezas diferentes (preço por unidade x
                  valor do escopo do TR). A mediana só faz sentido comparando a mesma grandeza —
                  reveja os roteiros antes de consolidar.
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Órgão / Origem</TableHead>
                    <TableHead>Objeto do contrato</TableHead>
                    <TableHead>Valor considerado</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Referência</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Fonte</TableHead>
                    <TableHead>Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidatos.map((candidato) => (
                    <LinhaCandidatoSimilaridade
                      key={candidato.id}
                      candidato={candidato}
                      tr={tr}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
