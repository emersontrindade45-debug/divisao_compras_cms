import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SELECT_CLASS } from "@/components/common/selectClass";
import { CAMADAS_GEOGRAFICAS } from "@/lib/domain/camadaGeografica";
import { cn } from "@/lib/utils";

const CIDADES_BAIXADA =
  CAMADAS_GEOGRAFICAS.find((c) => c.nome === "baixada_santista")?.cidades ?? [];

export function CandidatosFilters({
  municipio,
  categoria,
  cnpj,
  categorias,
}: {
  municipio: string;
  categoria: string;
  cnpj: string;
  categorias: string[];
}) {
  return (
    <form method="get" action="/fornecedores/candidatos" className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Município</span>
        <Input
          name="municipio"
          list="cidades-baixada"
          defaultValue={municipio}
          placeholder="Santos"
          className="w-44"
          aria-label="Filtrar por município"
        />
        <datalist id="cidades-baixada">
          {CIDADES_BAIXADA.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Categoria</span>
        <select
          name="categoria"
          className={cn(SELECT_CLASS, "w-52")}
          defaultValue={categoria}
          aria-label="Filtrar por categoria"
        >
          <option value="">Todas</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">CNPJ</span>
        <Input
          name="cnpj"
          defaultValue={cnpj}
          placeholder="00.000.000/0000-00"
          className="w-48 font-mono"
          aria-label="Buscar por CNPJ"
        />
      </label>

      <Button type="submit" size="sm">
        Buscar
      </Button>
      {(municipio || categoria || cnpj) && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          render={<Link href="/fornecedores/candidatos" />}
        >
          Limpar
        </Button>
      )}
    </form>
  );
}
