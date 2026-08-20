import Link from "next/link";
import { Search } from "lucide-react";
import { FornecedoresPageClient } from "@/components/fornecedores/FornecedoresPageClient";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import type {
  FornecedorFixture,
  HistoricoCotacaoFixture,
} from "@/lib/fixtures/fornecedores";

const STATUS_RESPOSTA_MAP: Record<string, HistoricoCotacaoFixture["statusResposta"]> = {
  respondido: "respondido",
  nao_respondido: "nao-respondido",
  recusado: "recusado",
};

const STATUS_COTACAO_MAP: Record<string, HistoricoCotacaoFixture["statusResposta"]> = {
  positiva: "respondido",
  incompleta: "respondido",
  negativa: "recusado",
  silenciosa: "nao-respondido",
};

export default async function FornecedoresPage() {
  await requireAuth();

  const fornecedoresDb = await db.fornecedor.findMany({
    select: {
      id: true,
      cnpj: true,
      razaoSocial: true,
      nomeFantasia: true,
      categoria: true,
      cidade: true,
      estado: true,
      responsavelContato: true,
      email: true,
      telefone: true,
      score: true,
      totalCotacoes: true,
      totalRespostas: true,
      taxaResposta: true,
      ultimaResposta: true,
      status: true,
      historicoCotacoes: {
        select: {
          id: true,
          processoNumero: true,
          data: true,
          statusResposta: true,
          valorProposto: true,
        },
        orderBy: { data: "desc" },
      },
      cotacoes: {
        select: {
          id: true,
          status: true,
          dataEnvio: true,
          valorProposto: true,
          processo: { select: { numero: true } },
        },
        orderBy: { dataEnvio: "desc" },
      },
    },
    orderBy: { razaoSocial: "asc" },
  });

  const fornecedores: FornecedorFixture[] = fornecedoresDb.map((f) => ({
    id: f.id,
    cnpj: f.cnpj,
    razaoSocial: f.razaoSocial,
    nomeFantasia: f.nomeFantasia ?? undefined,
    categoria: f.categoria,
    cidade: f.cidade,
    estado: f.estado,
    responsavelContato: f.responsavelContato,
    email: f.email,
    telefone: f.telefone ?? undefined,
    score: f.score,
    totalCotacoes: f.totalCotacoes,
    totalRespostas: f.totalRespostas,
    taxaResposta: Number(f.taxaResposta),
    ultimaResposta: f.ultimaResposta?.toISOString().slice(0, 10),
    status: f.status,
  }));

  const historico: HistoricoCotacaoFixture[] = fornecedoresDb.flatMap((f) => [
    ...f.cotacoes.map((c) => ({
      id: c.id,
      fornecedorId: f.id,
      processoNumero: c.processo.numero,
      data: c.dataEnvio.toISOString().slice(0, 10),
      statusResposta: STATUS_COTACAO_MAP[c.status] ?? ("nao-respondido" as const),
      valorProposto: c.valorProposto ? Number(c.valorProposto) : undefined,
    })),
    ...f.historicoCotacoes.map((h) => ({
      id: h.id,
      fornecedorId: f.id,
      processoNumero: h.processoNumero,
      data: h.data.toISOString().slice(0, 10),
      statusResposta: STATUS_RESPOSTA_MAP[h.statusResposta] ?? ("nao-respondido" as const),
      valorProposto: h.valorProposto ? Number(h.valorProposto) : undefined,
    })),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fornecedores"
        description="Cadastro vivo, score operacional e histórico de resposta por processo."
        actions={
          <Button size="sm" variant="outline" render={<Link href="/fornecedores/descobrir" />}>
            <Search className="size-3.5" aria-hidden />
            Descobrir candidatos
          </Button>
        }
      />
      <FornecedoresPageClient fornecedores={fornecedores} historico={historico} />
    </div>
  );
}
