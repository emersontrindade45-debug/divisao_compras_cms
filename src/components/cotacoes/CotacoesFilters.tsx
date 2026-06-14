"use client";

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/50";

interface CotacoesFiltersProps {
  statusFiltro: string;
  onStatusChange: (value: string) => void;
}

export function CotacoesFilters({ statusFiltro, onStatusChange }: CotacoesFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className={SELECT_CLASS}
        value={statusFiltro}
        onChange={(e) => onStatusChange(e.target.value)}
        aria-label="Filtrar por status"
      >
        <option value="todos">Todos os status</option>
        <option value="positiva">Positiva</option>
        <option value="negativa">Negativa</option>
        <option value="incompleta">Incompleta</option>
        <option value="silenciosa">Silenciosa</option>
      </select>
    </div>
  );
}
