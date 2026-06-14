"use client";

import { Input } from "@/components/ui/input";

export interface FornecedoresFilters {
  busca: string;
  categoria: string;
  cidade: string;
  status: string;
  scoreMinimo: string;
}

interface FornecedoresFiltersProps {
  busca: string;
  categoria: string;
  cidade: string;
  status: string;
  scoreMinimo: string;
  categorias: string[];
  cidades: string[];
  onChange: (filters: FornecedoresFilters) => void;
}

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/50";

export function FornecedoresFilters({
  busca,
  categoria,
  cidade,
  status,
  scoreMinimo,
  categorias,
  cidades,
  onChange,
}: FornecedoresFiltersProps) {
  const current: FornecedoresFilters = { busca, categoria, cidade, status, scoreMinimo };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="h-8 w-52"
        placeholder="Filtrar por razão social ou CNPJ"
        value={busca}
        onChange={(e) => onChange({ ...current, busca: e.target.value })}
      />

      <select
        className={SELECT_CLASS}
        value={categoria}
        onChange={(e) => onChange({ ...current, categoria: e.target.value })}
        aria-label="Filtrar por categoria"
      >
        <option value="todos">Todas as categorias</option>
        {categorias.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        className={SELECT_CLASS}
        value={cidade}
        onChange={(e) => onChange({ ...current, cidade: e.target.value })}
        aria-label="Filtrar por cidade"
      >
        <option value="todos">Todas as cidades</option>
        {cidades.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        className={SELECT_CLASS}
        value={status}
        onChange={(e) => onChange({ ...current, status: e.target.value })}
        aria-label="Filtrar por status"
      >
        <option value="todos">Todos os status</option>
        <option value="ativo">Ativo</option>
        <option value="inativo">Inativo</option>
      </select>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Score mínimo</span>
        <Input
          type="number"
          className="h-8 w-20"
          min={0}
          max={100}
          placeholder="0"
          value={scoreMinimo}
          onChange={(e) => onChange({ ...current, scoreMinimo: e.target.value })}
          aria-label="Score mínimo"
        />
      </div>
    </div>
  );
}
