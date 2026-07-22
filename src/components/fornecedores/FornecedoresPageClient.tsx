"use client";

import { useState, useMemo } from "react";
import {
  FornecedoresFilters,
  type FornecedoresFilters as FiltersType,
} from "@/components/fornecedores/FornecedoresFilters";
import { FornecedoresTable } from "@/components/fornecedores/FornecedoresTable";
import { FornecedorHistorico } from "@/components/fornecedores/FornecedorHistorico";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  FornecedorFixture,
  HistoricoCotacaoFixture,
} from "@/lib/fixtures/fornecedores";

interface FornecedoresPageClientProps {
  fornecedores: FornecedorFixture[];
  historico: HistoricoCotacaoFixture[];
}

export function FornecedoresPageClient({ fornecedores, historico }: FornecedoresPageClientProps) {
  const categorias = useMemo(
    () =>
      Array.from(new Set(fornecedores.flatMap((f) => f.categoria))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [fornecedores],
  );

  const cidades = useMemo(
    () =>
      Array.from(new Set(fornecedores.map((f) => f.cidade))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [fornecedores],
  );

  const [filtros, setFiltros] = useState<FiltersType>({
    busca: "",
    categoria: "todos",
    cidade: "todos",
    status: "todos",
    scoreMinimo: "",
  });

  const [selectedFornecedor, setSelectedFornecedor] = useState<FornecedorFixture | null>(null);

  const fornecedoresFiltrados = useMemo(() => {
    return fornecedores.filter((f) => {
      if (filtros.busca) {
        const termo = filtros.busca.toLowerCase();
        const matchRazao = f.razaoSocial.toLowerCase().includes(termo);
        const matchCnpj = f.cnpj.includes(termo);
        if (!matchRazao && !matchCnpj) return false;
      }

      if (filtros.categoria !== "todos" && !f.categoria.includes(filtros.categoria)) {
        return false;
      }

      if (filtros.cidade !== "todos" && f.cidade !== filtros.cidade) {
        return false;
      }

      if (filtros.status !== "todos" && f.status !== filtros.status) {
        return false;
      }

      if (filtros.scoreMinimo !== "" && f.score < Number(filtros.scoreMinimo)) {
        return false;
      }

      return true;
    });
  }, [fornecedores, filtros]);

  const historicoSelecionado = useMemo(
    () =>
      selectedFornecedor
        ? historico.filter((hc) => hc.fornecedorId === selectedFornecedor.id)
        : [],
    [historico, selectedFornecedor],
  );

  return (
    <>
      <FornecedoresFilters
        busca={filtros.busca}
        categoria={filtros.categoria}
        cidade={filtros.cidade}
        status={filtros.status}
        scoreMinimo={filtros.scoreMinimo}
        categorias={categorias}
        cidades={cidades}
        onChange={setFiltros}
      />

      <FornecedoresTable
        fornecedores={fornecedoresFiltrados}
        onVerHistorico={setSelectedFornecedor}
      />

      <Sheet
        open={selectedFornecedor !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedFornecedor(null);
        }}
      >
        <SheetContent side="right" className="w-[480px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Histórico do fornecedor</SheetTitle>
          </SheetHeader>
          {selectedFornecedor !== null && (
            <div className="mt-4">
              <FornecedorHistorico
                fornecedor={selectedFornecedor}
                historico={historicoSelecionado}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
