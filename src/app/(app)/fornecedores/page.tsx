"use client";

import { useState, useMemo } from "react";
import { FORNECEDORES, HISTORICO_COTACOES } from "@/lib/fixtures/fornecedores";
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
import type { FornecedorFixture } from "@/lib/fixtures/fornecedores";

const categorias = Array.from(
  new Set(FORNECEDORES.flatMap((f) => f.categoria)),
).sort((a, b) => a.localeCompare(b, "pt-BR"));

const cidades = Array.from(new Set(FORNECEDORES.map((f) => f.cidade))).sort(
  (a, b) => a.localeCompare(b, "pt-BR"),
);

export default function FornecedoresPage() {
  const [filtros, setFiltros] = useState<FiltersType>({
    busca: "",
    categoria: "todos",
    cidade: "todos",
    status: "todos",
    scoreMinimo: "",
  });

  const [selectedFornecedor, setSelectedFornecedor] = useState<FornecedorFixture | null>(null);

  const fornecedoresFiltrados = useMemo(() => {
    return FORNECEDORES.filter((f) => {
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
  }, [filtros]);

  const historicoSelecionado = useMemo(
    () =>
      selectedFornecedor
        ? HISTORICO_COTACOES.filter((hc) => hc.fornecedorId === selectedFornecedor.id)
        : [],
    [selectedFornecedor],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Fornecedores</h1>
        <p className="text-sm text-muted-foreground">
          Cadastro vivo, score operacional e histórico de resposta.
        </p>
      </div>

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
    </div>
  );
}
