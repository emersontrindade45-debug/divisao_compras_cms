"use client";

import { useState } from "react";
import { CalendarClock, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { buscarVigenciaContrato } from "@/lib/actions/buscarVigenciaContrato";
import type { ContratoVigencia } from "@/lib/domain/contratosVigencia";

// Vigência dos contratos gerados pela contratação do candidato.
//
// Fica sob a data de homologação porque as três datas contam a mesma história
// em ordem: quando o preço foi homologado, quando o contrato começou e quando
// termina. Buscada por clique — o PNCP não tem endpoint de "contratos desta
// compra", e descobrir custa uma varredura nos contratos do órgão (ver
// `buscarContratosDaContratacao`).

/** dd/mm/aaaa a partir de "2025-04-07", sem passar por `Date` (que desloca fuso). */
function formatarDataISO(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

export function VigenciaContratoCelula({
  resultadoId,
  contratosIniciais,
  buscadaEm,
  temLinkPncp,
}: {
  resultadoId: string;
  contratosIniciais: ContratoVigencia[];
  /** ISO de quando a busca rodou; `null` = nunca buscada. */
  buscadaEm: string | null;
  /** Sem link de edital do PNCP não há contrato a consultar — o botão não aparece. */
  temLinkPncp: boolean;
}) {
  const [contratos, setContratos] = useState(contratosIniciais);
  const [jaBuscou, setJaBuscou] = useState(buscadaEm !== null);
  const [buscando, setBuscando] = useState(false);

  if (!temLinkPncp) return null;

  const buscar = async () => {
    setBuscando(true);
    try {
      const resultado = await buscarVigenciaContrato(resultadoId);
      if (resultado.error || !resultado.data) {
        toast.error(resultado.error ?? "Não foi possível consultar os contratos no PNCP.");
        return;
      }
      setContratos(resultado.data.contratos);
      setJaBuscou(true);
      if (resultado.data.contratos.length === 0) {
        toast.info("O PNCP não tem contrato publicado para esta contratação.");
      }
    } catch {
      toast.error("Não foi possível consultar os contratos no PNCP.");
    } finally {
      setBuscando(false);
    }
  };

  if (contratos.length > 0) {
    return (
      <div className="mt-1 space-y-1">
        {contratos.map((contrato) => (
          <div key={`${contrato.ano}-${contrato.sequencial}`} className="text-xs">
            <a
              href={contrato.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
              title={contrato.objeto ?? undefined}
            >
              contrato {contrato.ano}/{contrato.sequencial}
              <ExternalLink className="size-3" aria-hidden />
            </a>
            <span className="block tabular-nums text-muted-foreground">
              {formatarDataISO(contrato.dataVigenciaInicio)} a{" "}
              {formatarDataISO(contrato.dataVigenciaFim)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Buscado e sem contrato é resposta, não ausência de tentativa — o analista
  // precisa distinguir para não ficar clicando de novo (CLAUDE.md §9.93).
  if (jaBuscou) {
    return <span className="mt-1 block text-xs text-muted-foreground">sem contrato no PNCP</span>;
  }

  return (
    <button
      type="button"
      onClick={() => void buscar()}
      disabled={buscando}
      className="mt-1 flex w-fit items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
    >
      <CalendarClock className="size-3" aria-hidden />
      {buscando ? "consultando…" : "ver vigência"}
    </button>
  );
}
