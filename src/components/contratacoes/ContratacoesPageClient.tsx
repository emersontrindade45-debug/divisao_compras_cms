"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ContratacoesFilters,
  type ContratacoesFilters as FiltersType,
} from "@/components/contratacoes/ContratacoesFilters";
import { ContratacoesTable } from "@/components/contratacoes/ContratacoesTable";
import { ComparadorContratacoes } from "@/components/contratacoes/ComparadorContratacoes";
import { RegistroAderenciaForm } from "@/components/contratacoes/RegistroAderenciaForm";
import { registrarAderencia } from "@/lib/actions/contratacoes";
import type { ContratacaoFixture } from "@/lib/fixtures/contratacoes";

const ADERENCIA_DB_MAP = {
  aderente: "aderente",
  parcial: "parcial",
  "nao-aderente": "nao_aderente",
} as const;

export function ContratacoesPageClient({
  contratacoes,
}: {
  contratacoes: ContratacaoFixture[];
}) {
  const router = useRouter();

  const modalidades = useMemo(
    () =>
      Array.from(new Set(contratacoes.map((c) => c.modalidade))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [contratacoes],
  );

  const [filtros, setFiltros] = useState<FiltersType>({
    busca: "",
    aderencia: "todos",
    modalidade: "todos",
    dataInicio: "",
    dataFim: "",
  });

  const [comparando, setComparando] = useState<ContratacaoFixture[] | null>(null);
  const [classificando, setClassificando] = useState<ContratacaoFixture | null>(null);

  const contratacoesFiltradas = useMemo(() => {
    return contratacoes.filter((c) => {
      if (filtros.busca) {
        const termo = filtros.busca.toLowerCase();
        const matchObjeto = c.objeto.toLowerCase().includes(termo);
        const matchOrgao = c.orgao.toLowerCase().includes(termo);
        const matchProcesso = c.processoNumero?.toLowerCase().includes(termo);
        if (!matchObjeto && !matchOrgao && !matchProcesso) return false;
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
  }, [contratacoes, filtros]);

  return (
    <>
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
        onClassificar={(item) => setClassificando(item)}
      />

      {comparando !== null && (
        <ComparadorContratacoes
          items={comparando}
          onClose={() => setComparando(null)}
        />
      )}

      {classificando !== null && (
        <RegistroAderenciaForm
          contratacao={classificando}
          open
          onOpenChange={(v) => {
            if (!v) setClassificando(null);
          }}
          onSave={async ({ aderencia, justificativa }) => {
            const result = await registrarAderencia(classificando.id, {
              aderencia: ADERENCIA_DB_MAP[aderencia],
              justificativa,
            });
            if (!result.error) router.refresh();
            return result;
          }}
        />
      )}
    </>
  );
}
