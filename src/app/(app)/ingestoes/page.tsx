import { PageHeader } from "@/components/common/PageHeader";
import { LotesIngestaoTable } from "@/components/ingestoes/LotesIngestaoTable";
import { FontesReferenciaTable } from "@/components/ingestoes/FontesReferenciaTable";
import { listarLotesIngestao, listarFontesReferencia } from "@/lib/actions/ingestoes";

export default async function IngestoesPage() {
  const [lotesDb, fontesDb] = await Promise.all([listarLotesIngestao(), listarFontesReferencia()]);

  const lotes = lotesDb.map((lote) => ({
    id: lote.id,
    fonteNome: lote.fonteReferencia.nome,
    fonteChave: lote.fonteReferencia.chave,
    competencia: lote.competencia,
    urlArquivo: lote.urlArquivo,
    linhasLidas: lote.linhasLidas,
    linhasImportadas: lote.linhasImportadas,
    linhasRejeitadas: lote.linhasRejeitadas,
    iniciadoEm: lote.iniciadoEm.toISOString(),
    concluidoEm: lote.concluidoEm?.toISOString() ?? null,
    erro: lote.erro,
  }));

  const fontes = fontesDb.map((fonte) => ({
    id: fonte.id,
    chave: fonte.chave,
    nome: fonte.nome,
    esfera: fonte.esfera,
    periodicidade: fonte.periodicidade,
    ativa: fonte.ativa,
    urlOficial: fonte.urlOficial,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fontes de referência"
        description="Catálogo de tabelas de referência de preço (SINAPI, CADTERC, ...) e status das rodadas de ingestão (Módulo 8 do PRD)."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Fontes cadastradas</h2>
        <FontesReferenciaTable fontes={fontes} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Rodadas de ingestão</h2>
        <LotesIngestaoTable lotes={lotes} />
      </section>
    </div>
  );
}
