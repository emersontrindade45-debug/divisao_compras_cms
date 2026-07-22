import { ContratacoesPageClient } from "@/components/contratacoes/ContratacoesPageClient";
import { listarContratacoes } from "@/lib/actions/contratacoes";
import type { ContratacaoFixture } from "@/lib/fixtures/contratacoes";
import type { StatusDominio } from "@/lib/domain/status";

const ADERENCIA_MAP: Record<string, StatusDominio> = {
  aderente: "aderente",
  parcial: "parcial",
  nao_aderente: "nao-aderente",
};

export default async function ContratacoesPage() {
  const contratacoesDb = await listarContratacoes();

  const contratacoes: ContratacaoFixture[] = contratacoesDb.map((c) => ({
    id: c.id,
    processoId: c.processoId,
    processoNumero: c.processo.numero,
    numero: c.numero,
    orgao: c.orgao,
    objeto: c.objeto,
    modalidade: c.modalidade,
    valorUnitario: Number(c.valorUnitario),
    quantidade: c.quantidade,
    unidade: c.unidade,
    dataContratacao: c.dataContratacao.toISOString().slice(0, 10),
    fonte: c.fonteUrl ?? "—",
    aderencia: ADERENCIA_MAP[c.aderencia] ?? "pendente",
    justificativaAderencia: c.justificativaAderencia ?? undefined,
    palavrasChave: c.palavrasChave,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Contratações públicas similares</h1>
        <p className="text-sm text-muted-foreground">
          Busca e classificação de aderência por processo (fonte prioritária IN 65/2021).
        </p>
      </div>
      <ContratacoesPageClient contratacoes={contratacoes} />
    </div>
  );
}
