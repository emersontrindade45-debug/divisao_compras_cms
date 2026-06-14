"use client";

import { Input } from "@/components/ui/input";
import { STATUS_CONFIG, type StatusDominio } from "@/lib/domain/status";
import type { FiltrosProcesso } from "@/lib/domain/processoFilter";

export type { FiltrosProcesso };

const STATUS_OPTIONS = Object.entries(STATUS_CONFIG) as [StatusDominio, { label: string }][];

const selectClasses =
  "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function ProcessoFilters({
  filtros,
  responsaveis,
  onChange,
}: {
  filtros: FiltrosProcesso;
  responsaveis: string[];
  onChange: (filtros: FiltrosProcesso) => void;
}) {
  function update<K extends keyof FiltrosProcesso>(key: K, value: FiltrosProcesso[K]) {
    onChange({ ...filtros, [key]: value });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="filtro-busca">
          Busca
        </label>
        <Input
          id="filtro-busca"
          value={filtros.busca}
          onChange={(e) => update("busca", e.target.value)}
          placeholder="Filtrar por objeto ou número..."
          className="w-64"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="filtro-status">
          Status
        </label>
        <select
          id="filtro-status"
          className={selectClasses}
          value={filtros.status}
          onChange={(e) => update("status", e.target.value as FiltrosProcesso["status"])}
        >
          <option value="todos">Todos</option>
          {STATUS_OPTIONS.map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="filtro-responsavel">
          Responsável
        </label>
        <select
          id="filtro-responsavel"
          className={selectClasses}
          value={filtros.responsavel}
          onChange={(e) => update("responsavel", e.target.value)}
        >
          <option value="todos">Todos</option>
          {responsaveis.map((nome) => (
            <option key={nome} value={nome}>
              {nome}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="filtro-data-inicio">
          De
        </label>
        <Input
          id="filtro-data-inicio"
          type="date"
          value={filtros.dataInicio}
          onChange={(e) => update("dataInicio", e.target.value)}
          className="w-40"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="filtro-data-fim">
          Até
        </label>
        <Input
          id="filtro-data-fim"
          type="date"
          value={filtros.dataFim}
          onChange={(e) => update("dataFim", e.target.value)}
          className="w-40"
        />
      </div>
    </div>
  );
}
