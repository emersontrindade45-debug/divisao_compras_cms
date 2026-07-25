import { PageHeader } from "@/components/common/PageHeader";
import { requireAuth } from "@/lib/auth/rbac";

const ETAPAS = [
  {
    titulo: "Abra o processo no sistema",
    descricao:
      "O cadastro do objeto é feito na planilha padrão da Divisão. Em Processos, sincronize a planilha para trazer os itens a cotar.",
  },
  {
    titulo: "Consulte contratações públicas similares",
    descricao:
      "Priorize fontes públicas (PNCP, ComprasNet). Registre a aderência e justifique quando necessário.",
  },
  {
    titulo: "Pesquise em sites eletrônicos admissíveis",
    descricao:
      "Use apenas sites da lista branca. Capture URL, valor e data/hora de acesso como evidência.",
  },
  {
    titulo: "Consulte fornecedores diretamente",
    descricao:
      "Envie o pedido de cotação a pelo menos 3 fornecedores pelo e-mail da Divisão e registre cada consulta aqui, incluindo os que não responderam.",
  },
  {
    titulo: "Valide as propostas recebidas",
    descricao:
      "Confira CNPJ, descrição, valor unitário/total, data e responsável em cada proposta.",
  },
  {
    titulo: "Consolide a série de preços",
    descricao:
      "Escolha o método (média, mediana ou menor valor). O sistema gera o coeficiente de variação — analise dispersões acima de 25%.",
  },
  {
    titulo: "Exporte a memória de cálculo",
    descricao:
      "Gere o relatório completo com fontes, evidências e cálculos para instrução processual.",
  },
] as const;

export const metadata = { title: "Guia de uso — Pesquisa de Preços / CMS" };

export default async function OnboardingPage() {
  await requireAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Fluxo correto de pesquisa de preços"
        description="Siga estas etapas na ordem para garantir conformidade com a IN SEGES/ME 65/2021."
      />

      {/* Guia de referência, não checklist de progresso: o andamento real de cada
          processo vive no painel de conformidade do respectivo detalhe. */}
      <ol className="space-y-4">
        {ETAPAS.map((etapa, idx) => (
          <li key={idx} className="flex gap-4 rounded-lg border p-4">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
              {idx + 1}
            </span>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{etapa.titulo}</p>
              <p className="text-sm text-muted-foreground">{etapa.descricao}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-xs text-muted-foreground">
        Dúvidas? Consulte o manual de operação disponível na intranet da CMS.
      </p>
    </div>
  );
}
