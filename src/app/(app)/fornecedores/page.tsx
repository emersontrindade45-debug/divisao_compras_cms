import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";

export default function FornecedoresPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Fornecedores</h1>
        <p className="text-sm text-muted-foreground">
          Cadastro vivo, score operacional e histórico de resposta.
        </p>
      </div>
      <EmptyState
        icon={Building2}
        title="Módulo em construção"
        description="A interface deste módulo chega no M3."
      />
    </div>
  );
}
