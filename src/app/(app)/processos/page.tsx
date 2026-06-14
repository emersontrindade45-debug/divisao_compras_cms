import { SheetsBanner } from "@/components/processos/SheetsBanner";
import { ProcessosTable } from "@/components/processos/ProcessosTable";
import { listarProcessos } from "@/lib/actions/listar";
import type { ProcessoFixture } from "@/lib/fixtures/processos";
import type { StatusDominio } from "@/lib/domain/status";

const STATUS_MAP: Record<string, StatusDominio> = {
  aderente: "aderente",
  parcial: "parcial",
  nao_aderente: "nao-aderente",
  pendente: "pendente",
};

export default async function ProcessosPage() {
  const sheetsUrl = process.env.NEXT_PUBLIC_SHEETS_URL || undefined;
  const processos = await listarProcessos();

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
    dataAbertura: p.dataAbertura.toISOString().slice(0, 10),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Processos</h1>
        <p className="text-sm text-muted-foreground">
          Processos de pesquisa de preços.
        </p>
      </div>
      <SheetsBanner sheetsUrl={sheetsUrl} />
      <ProcessosTable processos={processosMapeados} />
    </div>
  );
}
