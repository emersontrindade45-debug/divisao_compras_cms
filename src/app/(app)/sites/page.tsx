import { SitesPageClient } from "@/components/sites/SitesPageClient";
import { listarCapturas, listarSites } from "@/lib/actions/sites";
import { listarProcessos } from "@/lib/actions/listar";
import type { SiteFixture } from "@/lib/fixtures/sites";
import type { CapturaRow } from "@/components/sites/CapturasTable";
import { PageHeader } from "@/components/common/PageHeader";

export default async function SitesPage() {
  const [sitesDb, capturasDb, processosDb] = await Promise.all([
    listarSites(),
    listarCapturas(),
    listarProcessos(),
  ]);

  const sites: SiteFixture[] = sitesDb.map((s) => ({
    id: s.id,
    url: s.url,
    nome: s.nome,
    lista: s.lista,
    motivo: s.motivo ?? undefined,
    categoria: s.categoria,
    isMarketplace: s.isMarketplace,
  }));

  const capturas: CapturaRow[] = capturasDb.map((c) => ({
    id: c.id,
    siteNome: c.site.nome,
    processoId: c.processoId,
    processoNumero: c.processo.numero,
    processoObjeto: c.processo.objeto,
    url: c.url,
    produto: c.produto,
    valorUnitario: Number(c.valorUnitario),
    dataHoraAcesso: c.dataHoraAcesso.toISOString(),
    evidencia: c.evidencia ?? undefined,
  }));

  const processos = processosDb.map((p) => ({
    id: p.id,
    numero: p.numero,
    objeto: p.objeto,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sites admissíveis"
        description="Evidências de sites vinculadas a cada processo, com captura de data/hora e bloqueio de marketplaces."
      />
      <SitesPageClient sites={sites} capturas={capturas} processos={processos} />
    </div>
  );
}
