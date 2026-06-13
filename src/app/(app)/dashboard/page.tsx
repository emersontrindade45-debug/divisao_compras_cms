import { FolderSearch, Mail, TriangleAlert } from "lucide-react";
import { MetricCard } from "@/components/common/MetricCard";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da operação de pesquisa de preços.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Processos em aberto" value={14} delta={{ value: "+3", positive: true }} hint="vs. semana anterior" icon={FolderSearch} />
        <MetricCard label="Taxa de resposta" value="72%" delta={{ value: "-4%", positive: false }} hint="fornecedores no mês" icon={Mail} />
        <MetricCard label="Processos com gargalo" value={3} hint="sem fonte pública suficiente" icon={TriangleAlert} />
      </div>
    </div>
  );
}
