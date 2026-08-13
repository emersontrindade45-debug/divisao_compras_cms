import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProcessoHeader } from "@/components/processos/ProcessoHeader";
import {
  ProcessoTabs,
  type CotacaoResumo,
  type FonteResumo,
} from "@/components/processos/ProcessoTabs";
import { AssistenteToggle } from "@/components/assistente/AssistenteDock";
import { ConformidadePanel } from "@/components/processos/ConformidadePanel";
import { ExcluirProcessoDialog } from "@/components/processos/ExcluirProcessoDialog";
import { FontesSimilaridadeList } from "@/components/processos/FontesSimilaridadeList";
import { obterProcessoDetalhado } from "@/lib/actions/listar";
import { avaliarConformidade } from "@/lib/domain/conformidade";
import type { ProcessoFixture } from "@/lib/fixtures/processos";
import type { SeriePrecoFixture, TipoFonte } from "@/lib/fixtures/seriePrecos";
import type { StatusDominio } from "@/lib/domain/status";

/**
 * `processarPesquisaSimilaridade` (server action disparada pelo formulário de
 * upload do TR desta página) usa o registry de provedores públicos
 * (docs/ApiPlan.md §3.4) para todos os itens do processo. Um arquivo com
 * `"use server"` só pode exportar funções assíncronas (Next 16/Turbopack) —
 * `maxDuration` não pode morar lá; a configuração de rota vive no segmento
 * (esta página). Mesmo teto e mesma justificativa da rota do assistente
 * (`/api/assistente/chat/route.ts`): 60s é o limite do plano Hobby e é aceito
 * em todos os planos — subir isso exige confirmar o plano da conta antes.
 */
export const maxDuration = 60;

const STATUS_MAP: Record<string, StatusDominio> = {
  aderente: "aderente",
  parcial: "parcial",
  nao_aderente: "nao-aderente",
  pendente: "pendente",
};

const TIPO_FONTE_MAP: Record<string, TipoFonte> = {
  contratacao_publica: "contratacao-publica",
  site_eletronico: "site-eletronico",
  fornecedor_direto: "fornecedor-direto",
};

export default async function ProcessoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const processo = await obterProcessoDetalhado(id);

  if (!processo) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <AlertTriangle className="size-8 text-danger" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Processo não encontrado. Ele pode ter sido removido.
        </p>
        <Button render={<Link href="/processos" />} variant="outline" size="sm">
          Voltar para a lista
        </Button>
      </div>
    );
  }

  const processoMapeado: ProcessoFixture = {
    id: processo.id,
    numero: processo.numero,
    objeto: processo.objeto,
    unidade: processo.unidade,
    quantidade: processo.quantidade,
    caracteristicasTecnicas: processo.caracteristicasTecnicas,
    palavrasChave: processo.palavrasChave,
    classificacao: processo.classificacao === "especifico" ? "especifico" : "comum",
    responsavel: processo.responsavel,
    status: STATUS_MAP[processo.status] ?? "pendente",
    dataAbertura: processo.dataAbertura.toISOString().slice(0, 10),
  };

  const fontes: FonteResumo[] = processo.itens.flatMap((item) =>
    item.fontes.map((f) => ({
      id: f.id,
      itemDescricao: item.descricao,
      tipo: f.tipo,
      descricao: f.descricao,
      orgaoOuFornecedor: f.orgaoOuFornecedor,
      dataReferencia: f.dataReferencia.toISOString(),
      valorUnitario: Number(f.valorUnitario),
      status: f.status,
      motivoExclusao: f.motivoExclusao ?? undefined,
      totalEvidencias: f.evidencias.length,
    })),
  );

  const serieDb = processo.itens
    .flatMap((item) => item.seriePrecos)
    .find((s) => s.precos.length > 0 || Number(s.valorEstimado) > 0);

  const serie: SeriePrecoFixture | undefined = serieDb
    ? {
        processoId: processo.id,
        metodo: serieDb.metodo === "menor_valor" ? "menor-valor" : serieDb.metodo,
        valorEstimado: Number(serieDb.valorEstimado),
        media: Number(serieDb.media),
        mediana: Number(serieDb.mediana),
        menorValor: Number(serieDb.menorValor),
        coeficienteVariacao: Number(serieDb.coeficienteVariacao),
        totalPrecos: serieDb.totalPrecos,
        precosIncluidos: serieDb.precosIncluidos,
        precos: serieDb.precos.map((p) => ({
          id: p.id,
          processoId: processo.id,
          fonte: TIPO_FONTE_MAP[p.fonte] ?? "fornecedor-direto",
          descricaoFonte: p.descricaoFonte,
          fornecedorOuOrgao: p.fornecedorOuOrgao,
          dataReferencia: p.dataReferencia.toISOString(),
          valorUnitario: Number(p.valorUnitario),
          status: p.status,
          motivoExclusao: p.motivoExclusao ?? undefined,
        })),
      }
    : undefined;

  const cotacoes: CotacaoResumo[] = processo.cotacoes.map((c) => ({
    id: c.id,
    fornecedorRazaoSocial: c.fornecedor.razaoSocial,
    dataEnvio: c.dataEnvio.toISOString(),
    dataLimite: c.dataLimite.toISOString(),
    status: c.status,
    valorProposto: c.valorProposto ? Number(c.valorProposto) : undefined,
    propostaStatus: c.proposta?.statusGeral,
  }));

  const conformidade = avaliarConformidade({
    temItens: processo.itens.length > 0,
    fontes: processo.itens.flatMap((item) =>
      item.fontes.map((f) => ({
        id: f.id,
        tipo: f.tipo,
        status: f.status,
        dataReferencia: f.dataReferencia,
        totalEvidencias: f.evidencias.length,
        naturezaObjeto: item.natureza,
      })),
    ),
    capturas: processo.capturas.length,
    // Candidatos de similaridade ainda não promovidos não vêm nesta query;
    // as fontes já promovidas contam pelo array acima.
    resultadosSimilaridade: 0,
    cotacoes: processo.cotacoes.map((c) => ({
      id: c.id,
      status: c.status,
      temProposta: c.proposta !== null,
      propostaStatus: c.proposta?.statusGeral,
    })),
    serie: serieDb
      ? {
          precosIncluidos: serieDb.precosIncluidos,
          valorEstimado: Number(serieDb.valorEstimado),
          coeficienteVariacao: Number(serieDb.coeficienteVariacao),
        }
      : undefined,
  });

  return (
    <div className="space-y-6">
      <ProcessoHeader
        processo={processoMapeado}
        acoes={
          <>
            <ExcluirProcessoDialog processoId={processo.id} numero={processo.numero} />
            <AssistenteToggle rotulo="Assistente" />
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ProcessoTabs
          processo={processoMapeado}
          conformidade={conformidade}
          fontes={fontes}
          cotacoes={cotacoes}
          serie={serie}
          fontesSimilaridade={<FontesSimilaridadeList processoId={processo.id} />}
        />
        <ConformidadePanel conformidade={conformidade} processoId={processo.id} />
      </div>
    </div>
  );
}
