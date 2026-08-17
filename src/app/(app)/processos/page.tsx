import { SheetsBanner } from "@/components/processos/SheetsBanner";
import { SincronizarPlanilhaForm } from "@/components/processos/SincronizarPlanilhaForm";
import { ProcessosTable } from "@/components/processos/ProcessosTable";
import { listarProcessos } from "@/lib/actions/listar";
import type { ProcessoFixture } from "@/lib/fixtures/processos";
import type { StatusDominio } from "@/lib/domain/status";
import { PageHeader } from "@/components/common/PageHeader";

const STATUS_MAP: Record<string, StatusDominio> = {
  aderente: "aderente",
  parcial: "parcial",
  nao_aderente: "nao-aderente",
  pendente: "pendente",
};

const STATUS_VALIDOS = ["aderente", "parcial", "nao_aderente", "pendente"] as const;

type StatusProcessoParam = (typeof STATUS_VALIDOS)[number];

function parseStatus(valor?: string): StatusProcessoParam | undefined {
  return STATUS_VALIDOS.find((s) => s === valor);
}

export default async function ProcessosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; busca?: string }>;
}) {
  const sheetsUrl = process.env.NEXT_PUBLIC_SHEETS_URL || undefined;
  const { status, busca } = await searchParams;

  // Filtro vindo da URL (cards do dashboard). Valor inválido é ignorado, não
  // quebra a listagem.
  const processos = await listarProcessos({
    status: parseStatus(status),
    busca: busca || undefined,
  });

  const processosMapeados: ProcessoFixture[] = processos.map((p) => ({
    id: p.id,
    numero: p.numero,
    objeto: p.objeto,
    unidade: p.unidade,
    quantidade: p.quantidade,
    caracteristicasTecnicas: p.caracteristicasTecnicas,
    palavrasChave: p.palavrasChave,
    classificacao: p.classificacao === "especifico" ? "especifico" : "comum",
    responsavel: p.responsavel,
    status: STATUS_MAP[p.status] ?? "pendente",
    faseAndamento: p.faseAndamento,
    dataAbertura: p.dataAbertura.toISOString().slice(0, 10),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Processos"
        description="Processos de pesquisa de preços sincronizados da planilha padrão."
      />
      <SheetsBanner sheetsUrl={sheetsUrl} />
      <SincronizarPlanilhaForm defaultUrl={sheetsUrl} />
      <ProcessosTable processos={processosMapeados} />
    </div>
  );
}
