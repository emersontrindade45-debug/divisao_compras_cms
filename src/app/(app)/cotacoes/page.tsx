import { Mail, Send, ClipboardCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CotacoesTable } from "@/components/cotacoes/CotacoesTable";
import { SelecaoFornecedoresForm } from "@/components/cotacoes/SelecaoFornecedoresForm";
import { ChecklistProposta } from "@/components/cotacoes/ChecklistProposta";
import { COTACOES, PROPOSTAS } from "@/lib/fixtures/cotacoes";

export default function CotacoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Cotações</h1>
        <p className="text-sm text-muted-foreground">
          Disparo de e-mails, painel de controle de SLA e checklist de propostas.
        </p>
      </div>

      <Tabs defaultValue="painel" className="space-y-4">
        <TabsList>
          <TabsTrigger value="painel" className="gap-2">
            <Mail className="size-3.5" />
            Painel de controle
          </TabsTrigger>
          <TabsTrigger value="nova" className="gap-2">
            <Send className="size-3.5" />
            Nova cotação
          </TabsTrigger>
          <TabsTrigger value="propostas" className="gap-2">
            <ClipboardCheck className="size-3.5" />
            Validação de propostas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="painel">
          <CotacoesTable cotacoes={COTACOES} />
        </TabsContent>

        <TabsContent value="nova">
          <SelecaoFornecedoresForm />
        </TabsContent>

        <TabsContent value="propostas" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {PROPOSTAS.length} proposta{PROPOSTAS.length !== 1 ? "s" : ""} recebida{PROPOSTAS.length !== 1 ? "s" : ""} para validação.
          </p>
          {PROPOSTAS.map((p) => (
            <ChecklistProposta key={p.id} proposta={p} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
