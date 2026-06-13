import { Globe } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";

export default function SitesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Sites admissíveis</h1>
        <p className="text-sm text-muted-foreground">Validação de sites com captura de data/hora e bloqueio de marketplaces.</p>
      </div>
      <EmptyState icon={Globe} title="Módulo em construção" description="A interface deste módulo chega no M3." />
    </div>
  );
}
