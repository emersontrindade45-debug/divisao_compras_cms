import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/EmptyState";
import { SeletorNaturezaItem } from "@/components/processos/SeletorNaturezaItem";
import {
  LinhaCandidatoSimilaridade,
  type CandidatoSimilaridadeView,
} from "@/components/processos/LinhaCandidatoSimilaridade";
import { obterFontesSimilaridade } from "@/lib/actions/listar";
import type {
  OperacaoAjusteValor,
  PeriodicidadeContrato,
} from "@/lib/domain/ajusteValorCandidato";

function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR");
}

/** `Decimal` do Prisma não atravessa a fronteira RSC — converte ou devolve null. */
function paraNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  return Number(valor);
}

type ResultadoDoBanco = Awaited<
  ReturnType<typeof obterFontesSimilaridade>
>[number]["resultadosSimilaridade"][number];

function paraView(fonte: ResultadoDoBanco): CandidatoSimilaridadeView {
  return {
    id: fonte.id,
    tipoCandidato: fonte.tipoCandidato,
    fonteDescricao: fonte.fonteDescricao,
    fonteOrgaoOuId: fonte.fonteOrgaoOuId,
    fonteUrl: fonte.fonteUrl,
    valorUnitario: Number(fonte.valorUnitario),
    dataFormatada: formatarData(fonte.dataReferencia),
    scoreFinal: Number(fonte.scoreFinal),
    promovidoParaFonte: fonte.promovidoParaFonte,
    competenciaReferencia: fonte.competenciaReferencia,
    regimeReferencia: fonte.regimeReferencia,
    localidadeReferencia: fonte.localidadeReferencia,
    ajusteValorBase: paraNumero(fonte.ajusteValorBase),
    ajusteOperacao: (fonte.ajusteOperacao as OperacaoAjusteValor | null) ?? null,
    ajusteQuantidade: paraNumero(fonte.ajusteQuantidade),
    ajusteUnidadeMedida: fonte.ajusteUnidadeMedida ?? null,
    ajusteQuantidadeTR: paraNumero(fonte.ajusteQuantidadeTR),
    ajustePeriodicidade: (fonte.ajustePeriodicidade as PeriodicidadeContrato | null) ?? null,
    valorUnitarioAjustado: paraNumero(fonte.valorUnitarioAjustado),
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
                  <TableHead>Referência</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.resultadosSimilaridade.map((fonte) => (
                  <LinhaCandidatoSimilaridade
                    key={fonte.id}
                    candidato={paraView(fonte)}
                    quantidadeItemTR={item.quantidade}
                    unidadeItemTR={item.unidade}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
