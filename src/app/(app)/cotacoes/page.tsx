import { Mail } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";

export default function CotacoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Cotações</h1>
        <p className="text-sm text-muted-foreground">
          Disparo de e-mails, controle de SLA e checklist de propostas.
        </p>
      </div>
      <EmptyState
        icon={Mail}
        title="Módulo em construção"
        description="A interface deste módulo chega no M4."
      />
    </div>
  );
}
