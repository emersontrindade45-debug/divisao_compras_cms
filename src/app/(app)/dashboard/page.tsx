import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderSearch,
  Mail,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { MetricCard } from "@/components/common/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PROCESSOS } from "@/lib/fixtures/processos";
import { COTACOES } from "@/lib/fixtures/cotacoes";

function calcularMetricas() {
  const emAndamento = PROCESSOS.filter(
    (p) => p.status === "pendente" || p.status === "parcial",
  ).length;

  const total = COTACOES.length;
  const respondidas = COTACOES.filter((c) => c.status === "positiva").length;
  const taxaResposta = total > 0 ? Math.round((respondidas / total) * 100) : 0;

  const gargalos = PROCESSOS.filter((p) => p.status === "nao-aderente").length;

  const silenciosas = COTACOES.filter((c) => c.status === "silenciosa").length;
  const vencidas = COTACOES.filter(
    (c) => c.diasRestantes < 0 && c.status === "silenciosa",
  ).length;

  return { emAndamento, taxaResposta, gargalos, silenciosas, vencidas, total };
}

const GARGALOS = PROCESSOS.filter(
  (p) => p.status === "nao-aderente" || p.status === "parcial",
).slice(0, 4);

const COTACOES_PENDENTES = COTACOES.filter(
  (c) => c.status === "silenciosa" || c.status === "incompleta",
).slice(0, 5);

export default function DashboardPage() {
  const m = calcularMetricas();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral da operação de pesquisa de preços.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Processos em andamento"
          value={m.emAndamento}
          delta={{ value: "+2", positive: true }}
          hint="vs. semana anterior"
          icon={FolderSearch}
        />
        <MetricCard
          label="Taxa de resposta"
          value={`${m.taxaResposta}%`}
          delta={{ value: "-4%", positive: false }}
          hint="fornecedores consultados no mês"
          icon={Mail}
        />
        <MetricCard
          label="Cotações silenciosas"
          value={m.silenciosas}
          hint={`${m.vencidas} com prazo vencido`}
          icon={Clock}
        />
        <MetricCard
          label="Processos com gargalo"
          value={m.gargalos}
          hint="sem fonte pública suficiente"
          icon={AlertTriangle}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="size-4 text-danger" />
              Processos com gargalo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            {GARGALOS.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum gargalo identificado.</p>
            ) : (
              GARGALOS.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{p.numero}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-52">{p.objeto}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="size-4 text-warning" />
              Cotações pendentes de retorno
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            {COTACOES_PENDENTES.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pendência no momento.</p>
            ) : (
              COTACOES_PENDENTES.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium truncate max-w-44">
                      {c.fornecedorRazaoSocial}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">{c.processoNumero}</p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span
                      className={
                        c.diasRestantes < 0
                          ? "text-xs font-medium text-danger tabular-nums"
                          : "text-xs text-muted-foreground tabular-nums"
                      }
                    >
                      {c.diasRestantes < 0
                        ? `Vencido ${Math.abs(c.diasRestantes)}d`
                        : `${c.diasRestantes}d restantes`}
                    </span>
                    {c.lembreteEnviado && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle2 className="size-3 text-success" />
                        Lembrete enviado
                      </span>
                    )}
                  </div>
                </div>
              ))
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
            {(["aderente", "parcial", "pendente", "nao-aderente"] as const).map((s) => {
              const count = PROCESSOS.filter((p) => p.status === s).length;
              return (
                <div key={s} className="rounded-md border p-3 text-center">
                  <p className="text-2xl font-semibold tabular-nums">{count}</p>
                  <div className="mt-1 flex justify-center">
                    <StatusBadge status={s} />
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
