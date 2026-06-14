import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderSearch,
  Mail,
} from "lucide-react";
import { MetricCard } from "@/components/common/MetricCard";
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
      select: { id: true, numero: true, objeto: true, status: true },
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

  const cotacoesPendentes = cotacoes
    .filter(
      (c) =>
        (c.status === "silenciosa" || c.status === "incompleta") &&
        c.dataLimite <= tresDiasAFrente,
    )
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral da operação de pesquisa de preços.
        </p>
      </div>

      {alertas.length > 0 && <AlertasBanner alertas={alertas} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Processos em andamento"
          value={emAndamento}
          hint={`${processos.length} total`}
          icon={FolderSearch}
        />
        <MetricCard
          label="Taxa de resposta"
          value={`${taxaResposta}%`}
          hint={`${respondidas} de ${total} cotações`}
          icon={Mail}
        />
        <MetricCard
          label="Cotações silenciosas"
          value={silenciosas}
          hint={`${vencidas} com prazo vencido`}
          icon={Clock}
        />
        <MetricCard
          label="Processos com gargalo"
          value={gargalos}
          hint="sem fonte pública suficiente"
          icon={AlertTriangle}
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumo de processos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["aderente", "parcial", "pendente", "nao_aderente"] as const).map((s) => {
              const count = processos.filter((p) => p.status === s).length;
              return (
                <div key={s} className="rounded-md border p-3 text-center">
                  <p className="text-2xl font-semibold tabular-nums">{count}</p>
                  <div className="mt-1 flex justify-center">
                    <StatusBadge status={s as never} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
