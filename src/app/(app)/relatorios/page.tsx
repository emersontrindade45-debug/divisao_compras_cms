import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";

export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Relatório resumido/completo e memória de cálculo.</p>
      </div>
      <EmptyState icon={BarChart3} title="Módulo em construção" description="A interface deste módulo chega no M4." />
    </div>
  );
}
