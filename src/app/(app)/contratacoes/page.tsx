import { FileText } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";

export default function ContratacoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Contratações públicas similares</h1>
        <p className="text-sm text-muted-foreground">Busca e classificação de aderência (fonte prioritária IN 65/2021).</p>
      </div>
      <EmptyState icon={FileText} title="Módulo em construção" description="A interface deste módulo chega no M3." />
    </div>
  );
}
