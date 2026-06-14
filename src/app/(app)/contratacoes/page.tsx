"use client";

import { useState, useMemo } from "react";
import { CONTRATACOES } from "@/lib/fixtures/contratacoes";
import {
  ContratacoesFilters,
  type ContratacoesFilters as FiltersType,
} from "@/components/contratacoes/ContratacoesFilters";
import { ContratacoesTable } from "@/components/contratacoes/ContratacoesTable";
import { ComparadorContratacoes } from "@/components/contratacoes/ComparadorContratacoes";
import type { ContratacaoFixture } from "@/lib/fixtures/contratacoes";

const modalidades = Array.from(new Set(CONTRATACOES.map((c) => c.modalidade))).sort((a, b) =>
  a.localeCompare(b, "pt-BR"),
);

export default function ContratacoesPage() {
  const [filtros, setFiltros] = useState<FiltersType>({
    busca: "",
    aderencia: "todos",
    modalidade: "todos",
    dataInicio: "",
    dataFim: "",
  });

  const [comparando, setComparando] = useState<ContratacaoFixture[] | null>(null);

  const contratacoesFiltradas = useMemo(() => {
    return CONTRATACOES.filter((c) => {
      if (filtros.busca) {
        const termo = filtros.busca.toLowerCase();
        const matchObjeto = c.objeto.toLowerCase().includes(termo);
        const matchOrgao = c.orgao.toLowerCase().includes(termo);
        if (!matchObjeto && !matchOrgao) return false;
      }

      if (filtros.aderencia !== "todos" && c.aderencia !== filtros.aderencia) {
        return false;
      }

      if (filtros.modalidade !== "todos" && c.modalidade !== filtros.modalidade) {
        return false;
      }

      if (filtros.dataInicio && c.dataContratacao < filtros.dataInicio) {
        return false;
      }

      if (filtros.dataFim && c.dataContratacao > filtros.dataFim) {
        return false;
      }

      return true;
    });
  }, [filtros]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Contratações públicas similares</h1>
        <p className="text-sm text-muted-foreground">
          Busca e classificação de aderência (fonte prioritária IN 65/2021).
        </p>
      </div>

      <ContratacoesFilters
        busca={filtros.busca}
        aderencia={filtros.aderencia}
        modalidade={filtros.modalidade}
        dataInicio={filtros.dataInicio}
        dataFim={filtros.dataFim}
        modalidades={modalidades}
        onChange={setFiltros}
      />

      <ContratacoesTable
        contratacoes={contratacoesFiltradas}
        onCompare={(items) => setComparando(items)}
      />

      {comparando !== null && (
        <ComparadorContratacoes
          items={comparando}
          onClose={() => setComparando(null)}
        />
      )}
    </div>
  );
}
