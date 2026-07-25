"use client";

import { Input } from "@/components/ui/input";
import { SELECT_CLASS } from "@/components/common/selectClass";

export interface ContratacoesFilters {
  busca: string;
  aderencia: string;
  modalidade: string;
  dataInicio: string;
  dataFim: string;
}

interface ContratacoesFiltersProps {
  busca: string;
  aderencia: string;
  modalidade: string;
  dataInicio: string;
  dataFim: string;
  modalidades: string[];
  onChange: (filters: ContratacoesFilters) => void;
}


export function ContratacoesFilters({
  busca,
  aderencia,
  modalidade,
  dataInicio,
  dataFim,
  modalidades,
  onChange,
}: ContratacoesFiltersProps) {
  const current: ContratacoesFilters = { busca, aderencia, modalidade, dataInicio, dataFim };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="h-8 w-52"
        placeholder="Filtrar por objeto ou órgão"
        value={busca}
        onChange={(e) => onChange({ ...current, busca: e.target.value })}
      />

      <select
        className={SELECT_CLASS}
        value={aderencia}
        onChange={(e) => onChange({ ...current, aderencia: e.target.value })}
        aria-label="Filtrar por aderência"
      >
        <option value="todos">Todas as aderências</option>
        <option value="aderente">Aderente</option>
        <option value="parcial">Parcial</option>
        <option value="nao-aderente">Não aderente</option>
        <option value="pendente">Pendente</option>
      </select>

      <select
        className={SELECT_CLASS}
        value={modalidade}
        onChange={(e) => onChange({ ...current, modalidade: e.target.value })}
        aria-label="Filtrar por modalidade"
      >
        <option value="todos">Todas as modalidades</option>
        {modalidades.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">De</span>
        <input
          type="date"
          className={SELECT_CLASS}
          value={dataInicio}
          onChange={(e) => onChange({ ...current, dataInicio: e.target.value })}
          aria-label="Data inicial"
        />
        <span className="text-xs text-muted-foreground">até</span>
        <input
          type="date"
          className={SELECT_CLASS}
          value={dataFim}
          onChange={(e) => onChange({ ...current, dataFim: e.target.value })}
          aria-label="Data final"
        />
      </div>
    </div>
  );
}
