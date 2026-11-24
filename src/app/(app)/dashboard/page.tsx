import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, FolderSearch, UserX } from "lucide-react";
import { MetricCard } from "@/components/common/MetricCard";
import { PageHeader } from "@/components/common/PageHeader";
import { AlertasBanner } from "@/components/common/AlertasBanner";
import { WorkQueueCard } from "@/components/dashboard/WorkQueueCard";
import { AtribuirResponsavelSelect } from "@/components/dashboard/AtribuirResponsavelSelect";
import { IndicadoresDesempenho } from "@/components/dashboard/IndicadoresDesempenho";
import { RespostaPorProcesso } from "@/components/dashboard/RespostaPorProcesso";
import { PainelDemandaDivisao } from "@/components/dashboard/PainelDemanda";
import { PendenciasDaFila } from "@/components/dashboard/PendenciasDaFila";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/rbac";
import { buscarAlertas } from "@/lib/actions/alertas";
import { escopoPadrao } from "@/lib/domain/indicadores/camadaAcao";
import {
  lerPeriodo,
  PERIODO_LABEL,
  PERIODOS,
  tituloPeriodo,
  type Periodo,
} from "@/lib/domain/indicadores/desempenho";
import { carregarCamadaDesempenho } from "@/lib/indicadores/desempenho";
import { lerFiltrosDoPainel } from "@/lib/domain/indicadores/painelDemanda";
import { carregarPainelDemanda } from "@/lib/indicadores/painelDemanda";
import { carregarFornecedores } from "@/lib/indicadores/fornecedores";
import {
  carregarCamadaAcao,
  contarProcessosDoUsuario,
  listarUsuariosAtribuiveis,
  type Escopo,
} from "@/lib/indicadores/camadaAcao";
import { cn } from "@/lib/utils";

const FILA_RESUMIDA = 10;
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Dashboard em duas camadas (M30): AÇÃO no topo (o que fazer agora, sem
 * período) e DESEMPENHO abaixo (indicadores do PRD — M30.b).
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    escopo?: string;
    fila?: string;
    periodo?: string;
    ano?: string;
    categoria?: string;
  }>;
}) {
  const user = await requireAuth();
  const params = await searchParams;
  const agora = new Date();

  const escopo: Escopo =
    params.escopo === "meus" || params.escopo === "todos"
      ? params.escopo
      : escopoPadrao(user.role, await contarProcessosDoUsuario(user.id));
  const filaCompleta = params.fila === "todas";
  const periodo = lerPeriodo(params.periodo);

  // Filtros do painel de demanda: ficam na URL; valor fora do esperado é ignorado.
  const { ano: anoPedido, categoria: categoriaPedida } = lerFiltrosDoPainel(params);

  const [acao, desempenho, usuarios, alertas, demanda, fornecedores] = await Promise.all([
    carregarCamadaAcao(escopo, user.id, agora),
    carregarCamadaDesempenho(periodo, escopo, user.id, agora),
    listarUsuariosAtribuiveis(),
    buscarAlertas(),
    carregarPainelDemanda({ ano: anoPedido, categoria: categoriaPedida }),
    carregarFornecedores(),
  ]);

  const { resumo } = acao;

  const href = (o: { escopo?: Escopo; periodo?: Periodo; fila?: boolean }) => {
    const q = new URLSearchParams({ escopo: o.escopo ?? escopo, periodo: o.periodo ?? periodo });
    if (o.fila ?? filaCompleta) q.set("fila", "todas");
    if (anoPedido) q.set("ano", String(anoPedido));
    if (categoriaPedida) q.set("categoria", categoriaPedida);
    return `/dashboard?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="O que fazer agora e como a pesquisa de preços está andando."
      />

      {alertas.length > 0 && <AlertasBanner alertas={alertas} />}

      <section aria-labelledby="camada-demanda" className="space-y-4">
        <div>
          <h2
            id="camada-demanda"
            className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Demanda da Divisão{demanda.estado === "ok" ? ` · ${demanda.painel.ano}` : ""}
          </h2>
          <p className="text-xs text-muted-foreground">
            Onde a Divisão perde tempo: processos que chegam e voltam. Independe do período e do
            escopo abaixo.
          </p>
        </div>
        <PainelDemandaDivisao
          resultado={demanda}
          fornecedores={fornecedores}
          pendencias={
            <PendenciasDaFila
              respostasAConfirmar={acao.emails.respostasAConfirmar}
              enviosSemProcesso={acao.emails.enviosSemProcesso}
              semResponsavel={resumo.semResponsavel}
              vencidas={resumo.vencidas}
            />
          }
        />
      </section>

      <section aria-labelledby="camada-acao" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="camada-acao"
            className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Agora
          </h2>
          <nav aria-label="Escopo" className="inline-flex rounded-lg border p-0.5 text-xs">
            {(["meus", "todos"] as const).map((e) => (
              <Link
                key={e}
                href={href({ escopo: e })}
                aria-current={escopo === e ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1 font-medium",
                  escopo === e
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {e === "meus" ? "Meus" : "Todos"}
              </Link>
            ))}
          </nav>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Processos em andamento"
            value={resumo.ativos}
            hint="nem aderentes nem concluídos"
            icon={FolderSearch}
            href="/processos?status=pendente"
          />
          <MetricCard
            label="Sem fonte pública"
            value={resumo.semFontePublica}
            hint="nenhum preço de contratação pública incluído"
            icon={AlertTriangle}
            href="/processos"
          />
          <MetricCard
            label="Cotações sem resposta"
            value={resumo.semResposta}
            hint={`${resumo.vencidas} com prazo vencido`}
            icon={Clock}
            href="/cotacoes"
          />
          <MetricCard
            label="Sem responsável"
            value={resumo.semResponsavel}
            hint="processos ativos de toda a Divisão"
            icon={UserX}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <WorkQueueCard
              itens={filaCompleta ? acao.fila : acao.fila.slice(0, FILA_RESUMIDA)}
              total={acao.fila.length}
              verTodosHref={href({ fila: true })}
            />
          </div>

          <div className="min-w-0 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="size-4 text-warning" />
                  Cotações perto do prazo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-4">
                {acao.cotacoesPendentes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma pendência no momento.</p>
                ) : (
                  acao.cotacoesPendentes.slice(0, 5).map((c) => {
                    const dias = Math.ceil((c.dataLimite.getTime() - agora.getTime()) / DIA_MS);
                    return (
                      <Link
                        key={c.id}
                        href={`/processos/${c.processoId}?etapa=validacao`}
                        className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 hover:bg-muted/50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{c.fornecedor}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {c.processoNumero}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-0.5">
                          <span
                            className={cn(
                              "text-xs tabular-nums",
                              dias < 0 ? "font-medium text-danger" : "text-muted-foreground",
                            )}
                          >
                            {dias < 0 ? `Vencido ${Math.abs(dias)}d` : `${dias}d restantes`}
                          </span>
                          {c.lembreteEnviado && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CheckCircle2 className="size-3 text-success" />
                              Lembrete enviado
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })
                )}
                {acao.cotacoesPendentes.length > 5 && (
                  <Link
                    href="/cotacoes"
                    className="block pt-1 text-center text-xs font-medium text-primary hover:underline"
                  >
                    Ver todas ({acao.cotacoesPendentes.length})
                  </Link>
                )}
              </CardContent>
            </Card>

            {acao.semResponsavel.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <UserX className="size-4 text-warning" />
                    Processos sem responsável
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pb-4">
                  {acao.semResponsavel.slice(0, 8).map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <Link href={`/processos/${p.id}`} className="min-w-0 hover:underline">
                        <p className="text-sm font-medium tabular-nums">{p.numero}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.objeto}</p>
                      </Link>
                      <AtribuirResponsavelSelect
                        processoId={p.id}
                        numero={p.numero}
                        usuarios={usuarios}
                      />
                    </div>
                  ))}
                  {acao.semResponsavel.length > 8 && (
                    <p className="pt-1 text-center text-xs text-muted-foreground">
                      e mais {acao.semResponsavel.length - 8} — atribua estes primeiro.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </section>

      <details
        open={Boolean(params.periodo)}
        className="group rounded-xl border bg-card print:hidden"
      >
        <summary className="cursor-pointer select-none px-4 py-3">
          <h2
            id="camada-desempenho"
            className="inline text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Desempenho · {tituloPeriodo(periodo, agora)}
          </h2>
          <span className="ml-2 text-xs text-muted-foreground">
            tempos e respostas da pesquisa de preços (clique para abrir)
          </span>
        </summary>
        <div className="space-y-4 border-t p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">
                {desempenho.dadosTempoDesde
                  ? `Tempos calculados com dados confiáveis desde ${desempenho.dadosTempoDesde.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
                  : "Ainda não há processo com data de abertura confirmada — os tempos aparecem a partir das próximas importações."}
              </p>
            </div>
            <nav aria-label="Período" className="inline-flex rounded-lg border p-0.5 text-xs">
              {PERIODOS.map((p) => (
                <Link
                  key={p}
                  href={href({ periodo: p })}
                  aria-current={periodo === p ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1 font-medium",
                    periodo === p
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {PERIODO_LABEL[p]}
                </Link>
              ))}
            </nav>
          </div>

          <IndicadoresDesempenho dados={desempenho} />
          <RespostaPorProcesso processos={desempenho.porProcesso} />
        </div>
      </details>
    </div>
  );
}
