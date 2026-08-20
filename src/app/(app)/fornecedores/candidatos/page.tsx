import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { CandidatosFilters } from "@/components/fornecedores/CandidatosFilters";
import { CandidatosTable } from "@/components/fornecedores/CandidatosTable";
import {
  buscarCandidatosFornecedor,
  listarCategoriasFornecedor,
} from "@/lib/actions/candidatosFornecedor";

function queryString(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor) u.set(chave, valor);
  }
  const qs = u.toString();
  return qs ? `?${qs}` : "";
}

export default async function CandidatosFornecedorPage({
  searchParams,
}: {
  searchParams: Promise<{ municipio?: string; categoria?: string; cnpj?: string; pagina?: string }>;
}) {
  const { municipio = "", categoria = "", cnpj = "", pagina: paginaBruta } = await searchParams;
  const pagina = Number(paginaBruta);
  const temFiltro = Boolean(municipio.trim() || categoria.trim() || cnpj.trim());

  const categorias = await listarCategoriasFornecedor();

  const busca = temFiltro
    ? await buscarCandidatosFornecedor({
        municipio,
        categoria,
        cnpj,
        pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
      })
    : null;

  const resultado = busca?.data;
  const erro = busca?.error;

  const paginaAtual = resultado?.pagina ?? 1;
  const total = resultado?.total ?? 0;
  const tamanho = resultado?.tamanhoPagina ?? 50;
  const totalPaginas = Math.max(1, Math.ceil(total / tamanho));
  const qsBase = { municipio: municipio.trim(), categoria: categoria.trim(), cnpj: cnpj.trim() };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Candidatos a fornecedor"
        description="Empresas ativas em SP, da Receita Federal, pesquisáveis por município, categoria (CNAE) ou CNPJ — sem busca por nome."
        actions={
          <Button variant="ghost" size="sm" render={<Link href="/fornecedores" />}>
            Voltar ao cadastro
          </Button>
        }
      />

      <CandidatosFilters
        municipio={municipio}
        categoria={categoria}
        cnpj={cnpj}
        categorias={categorias}
      />

      {erro ? <p className="text-sm text-destructive">{erro}</p> : null}

      {!temFiltro ? (
        <EmptyState
          icon={Search}
          title="Informe um filtro para buscar"
          description="A base tem milhões de empresas ativas em São Paulo. Busca sem município, categoria ou CNPJ é recusada de propósito — o índice não cobriria um dump da tabela inteira."
        />
      ) : resultado && resultado.candidatos.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nenhum candidato neste recorte"
          description="Tente outro município da Baixada, outra categoria, ou o CNPJ completo."
        />
      ) : resultado ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {total.toLocaleString("pt-BR")} candidato{total === 1 ? "" : "s"}
            {total > tamanho
              ? ` · página ${paginaAtual} de ${totalPaginas.toLocaleString("pt-BR")}`
              : ""}
          </p>
          <CandidatosTable candidatos={resultado.candidatos} categoriasDisponiveis={categorias} />
          {totalPaginas > 1 ? (
            <div className="flex items-center gap-2">
              {paginaAtual > 1 ? (
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <Link
                      href={`/fornecedores/candidatos${queryString({ ...qsBase, pagina: String(paginaAtual - 1) })}`}
                    />
                  }
                >
                  Anterior
                </Button>
              ) : null}
              {paginaAtual < totalPaginas ? (
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <Link
                      href={`/fornecedores/candidatos${queryString({ ...qsBase, pagina: String(paginaAtual + 1) })}`}
                    />
                  }
                >
                  Próxima
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
