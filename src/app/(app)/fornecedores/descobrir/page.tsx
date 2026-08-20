import Link from "next/link";
import { Search } from "lucide-react";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/common/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SELECT_CLASS } from "@/components/common/selectClass";
import { CandidatosCnpjTable } from "@/components/fornecedores/CandidatosCnpjTable";
import { buscarCandidatosCnpj, type CandidatoCnpjResultado } from "@/lib/actions/candidatosCnpj";

interface DescobrirCandidatosSearchParams {
  municipio?: string;
  cnae?: string;
  categoria?: string;
  busca?: string;
  cursor?: string;
}

/** Monta a query string preservando os filtros atuais, trocando só `cursor`. */
function queryStringPagina(params: DescobrirCandidatosSearchParams, cursor: string): string {
  const usp = new URLSearchParams();
  if (params.municipio) usp.set("municipio", params.municipio);
  if (params.cnae) usp.set("cnae", params.cnae);
  if (params.categoria) usp.set("categoria", params.categoria);
  if (params.busca) usp.set("busca", params.busca);
  usp.set("cursor", cursor);
  return `?${usp.toString()}`;
}

/**
 * Busca/promoção de candidatos a Fornecedor importados da base CNPJ/SP da
 * Receita Federal (M27). Tela dedicada, não extensão do cadastro manual —
 * não existe wizard de cadastro na UI hoje, e o domínio de busca (8,66M
 * linhas, índice só por [estado, município] e categoriaSugerida) é bem
 * diferente do de um formulário manual (decisão registrada em docs/PLAN.md
 * M27 etapa 6).
 *
 * Formulário GET simples (Server Component, sem JS) — busca é feita pela
 * própria navegação de página, sem estado de cliente.
 */
export default async function DescobrirCandidatosCnpjPage({
  searchParams,
}: {
  searchParams: Promise<DescobrirCandidatosSearchParams>;
}) {
  await requireAuth();

  const params = await searchParams;
  const municipio = params.municipio?.trim() ?? "";
  const cnae = params.cnae?.trim() ?? "";
  const categoria = params.categoria?.trim() ?? "";
  const busca = params.busca?.trim() ?? "";
  const cursor = params.cursor?.trim() || undefined;

  // Mesmo padrão de `sugerirFornecedoresPorObjeto`: categorias distintas do
  // cadastro real de Fornecedor ativo — não existe enum fixo de categoria no
  // repo. `categoriaSugerida` (etapa 4 do M27) fica de fora desta lista: é
  // calculada por CNAE e ainda cobre pouco da base real, então o filtro por
  // ela é aceito como praticamente inerte no v1 (limitação conhecida).
  const fornecedoresAtivos = await db.fornecedor.findMany({
    where: { status: "ativo" },
    select: { categoria: true },
  });
  const categoriasDisponiveis = [...new Set(fornecedoresAtivos.flatMap((f) => f.categoria))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );

  let candidatos: CandidatoCnpjResultado[] = [];
  let proximoCursor: string | null = null;
  let erroBusca: string | null = null;

  if (municipio) {
    const resultado = await buscarCandidatosCnpj({
      municipio,
      cnae: cnae || undefined,
      categoria: categoria || undefined,
      busca: busca || undefined,
      cursor,
    });
    if (resultado.error) {
      erroBusca = resultado.error;
    } else if (resultado.data) {
      candidatos = resultado.data.candidatos;
      proximoCursor = resultado.data.proximoCursor;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Descobrir candidatos a fornecedor"
        description="Busca na base de CNPJ/SP (Receita Federal) por município e CNAE. Adicionar um candidato o registra na planilha de fornecedores — não cria o cadastro diretamente."
      />

      <form method="GET" className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="municipio" className="text-xs font-medium text-muted-foreground">
            Município (obrigatório)
          </label>
          <Input
            id="municipio"
            name="municipio"
            defaultValue={municipio}
            placeholder="ex.: Santos"
            className="h-8 w-48"
            required
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="cnae" className="text-xs font-medium text-muted-foreground">
            CNAE (prefixo)
          </label>
          <Input
            id="cnae"
            name="cnae"
            defaultValue={cnae}
            placeholder="ex.: 4520"
            className="h-8 w-36"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="categoria" className="text-xs font-medium text-muted-foreground">
            Categoria
          </label>
          <select
            id="categoria"
            name="categoria"
            defaultValue={categoria}
            className={`${SELECT_CLASS} w-48`}
          >
            <option value="">Todas as categorias</option>
            {categoriasDisponiveis.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="busca" className="text-xs font-medium text-muted-foreground">
            Razão social contém
          </label>
          <Input
            id="busca"
            name="busca"
            defaultValue={busca}
            placeholder="ex.: construtora"
            className="h-8 w-56"
          />
        </div>

        <Button type="submit" size="sm">
          <Search className="size-3.5" aria-hidden />
          Buscar
        </Button>
      </form>

      {!municipio && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Informe um município para buscar candidatos — a base tem milhões de linhas e não é
          listada sem esse filtro.
        </p>
      )}

      {erroBusca && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {erroBusca}
        </p>
      )}

      {municipio && !erroBusca && (
        <>
          <CandidatosCnpjTable candidatos={candidatos} />
          {proximoCursor && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                render={<Link href={queryStringPagina(params, proximoCursor)} />}
              >
                Próxima página
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
