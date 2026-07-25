import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderSearch,
  Mail,
} from "lucide-react";
import { MetricCard } from "@/components/common/MetricCard";
import { PageHeader } from "@/components/common/PageHeader";
import { WorkQueueCard } from "@/components/dashboard/WorkQueueCard";
import { priorizarFilaTrabalho } from "@/lib/domain/filaTrabalho";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { AlertasBanner } from "@/components/common/AlertasBanner";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { buscarAlertas } from "@/lib/actions/alertas";

export default async function DashboardPage() {
  await requireAuth();

  const now = new Date();
  const tresDiasAFrente = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const [processos, cotacoes, alertas] = await Promise.all([
    db.processo.findMany({
      orderBy: { dataAbertura: "desc" },
      select: {
        id: true,
        numero: true,
        objeto: true,
        status: true,
        itens: {
          select: {
            fontes: { select: { tipo: true, status: true } },
            seriePrecos: {
              select: { precosIncluidos: true, coeficienteVariacao: true },
            },
          },
        },
        cotacoes: {
          select: {
            status: true,
            dataLimite: true,
            proposta: { select: { statusGeral: true } },
          },
        },
      },
    }),
    db.cotacao.findMany({
      include: {
        fornecedor: { select: { razaoSocial: true } },
        processo: { select: { numero: true } },
      },
      orderBy: { dataLimite: "asc" },
    }),
    buscarAlertas(),
  ]);

  const emAndamento = processos.filter(
    (p) => p.status === "pendente" || p.status === "parcial",
  ).length;

  const total = cotacoes.length;
  const respondidas = cotacoes.filter((c) => c.status === "positiva").length;
  const taxaResposta = total > 0 ? Math.round((respondidas / total) * 100) : 0;
  const silenciosas = cotacoes.filter((c) => c.status === "silenciosa").length;
  const vencidas = cotacoes.filter(
    (c) => c.status === "silenciosa" && c.dataLimite < now,
  ).length;
  const gargalos = processos.filter((p) => p.status === "nao_aderente").length;

  const gargalosList = processos
    .filter((p) => p.status === "nao_aderente" || p.status === "parcial")
    .slice(0, 4);

  const fila = priorizarFilaTrabalho(
    processos.map((p) => {
      const fontes = p.itens.flatMap((i) => i.fontes);
      const series = p.itens.flatMap((i) => i.seriePrecos);
      const cvs = series.map((s) => Number(s.coeficienteVariacao));
      return {
        processoId: p.id,
        numero: p.numero,
        objeto: p.objeto,
        status: p.status,
        temFontePublica: fontes.some(
          (f) => f.tipo === "contratacao_publica" && f.status === "incluido",
        ),
        cotacoesVencidas: p.cotacoes.filter(
          (c) => c.status === "silenciosa" && c.dataLimite < now,
        ).length,
        propostasPendentes: p.cotacoes.filter(
          (c) => c.proposta && c.proposta.statusGeral !== "valida",
        ).length,
        precosIncluidos: Math.max(0, ...series.map((s) => s.precosIncluidos)),
        coeficienteVariacao: cvs.length > 0 ? Math.max(...cvs) : null,
        temPesquisaIniciada: fontes.length > 0 || p.cotacoes.length > 0,
      };
    }),
  ).slice(0, 6);

  const cotacoesPendentes = cotacoes
    .filter(
      (c) =>
        (c.status === "silenciosa" || c.status === "incompleta") &&
        c.dataLimite <= tresDiasAFrente,
    )
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Visão geral da operação de pesquisa de preços."
      />

      {alertas.length > 0 && <AlertasBanner alertas={alertas} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Processos em andamento"
          value={emAndamento}
          hint={`${processos.length} total`}
          icon={FolderSearch}
          href="/processos?status=pendente"
        />
        <MetricCard
          label="Taxa de resposta"
          value={`${taxaResposta}%`}
          hint={`${respondidas} de ${total} cotações`}
          icon={Mail}
          href="/cotacoes"
        />
        <MetricCard
          label="Cotações silenciosas"
          value={silenciosas}
          hint={`${vencidas} com prazo vencido`}
          icon={Clock}
          href="/cotacoes"
        />
        <MetricCard
          label="Processos com gargalo"
          value={gargalos}
          hint="sem fonte pública suficiente"
          icon={AlertTriangle}
          href="/processos?status=nao_aderente"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="size-4 text-danger" />
              Processos com gargalo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            {gargalosList.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum gargalo identificado.</p>
            ) : (
              gargalosList.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{p.numero}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-52">{p.objeto}</p>
                  </div>
                  <StatusBadge status={p.status as never} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="size-4 text-warning" />
              Cotações pendentes de retorno
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            {cotacoesPendentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pendência no momento.</p>
            ) : (
              cotacoesPendentes.map((c) => {
                const diasRestantes = Math.ceil(
                  (c.dataLimite.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
                );
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium truncate max-w-44">
                        {c.fornecedor.razaoSocial}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {c.processo.numero}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span
                        className={
                          diasRestantes < 0
                            ? "text-xs font-medium text-danger tabular-nums"
                            : "text-xs text-muted-foreground tabular-nums"
                        }
                      >
                        {diasRestantes < 0
                          ? `Vencido ${Math.abs(diasRestantes)}d`
                          : `${diasRestantes}d restantes`}
                      </span>
                      {c.lembreteEnviado && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle2 className="size-3 text-success" />
                          Lembrete enviado
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <WorkQueueCard itens={fila} />
    </div>
  );
}
