"use client";

import { useState } from "react";
import { Calculator, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { PromoverFonteButton } from "@/components/processos/PromoverFonteButton";
import { DescartarResultadoButton } from "@/components/processos/DescartarResultadoButton";
import { ReferenciaSinapiInfo } from "@/components/processos/ReferenciaSinapiInfo";
import {
  AjusteValorCandidatoForm,
  PERIODICIDADE_LABEL,
} from "@/components/processos/AjusteValorCandidatoForm";
import type {
  OperacaoAjusteValor,
  PeriodicidadeContrato,
} from "@/lib/domain/ajusteValorCandidato";

/**
 * Candidato já serializado para o cliente: `Decimal` do Prisma e `Date` não
 * atravessam a fronteira RSC, então a conversão acontece em
 * `FontesSimilaridadeList` (Server Component).
 */
export interface CandidatoSimilaridadeView {
  id: string;
  tipoCandidato: string;
  fonteDescricao: string;
  fonteOrgaoOuId: string;
  fonteUrl: string | null;
  valorUnitario: number;
  dataFormatada: string;
  scoreFinal: number;
  promovidoParaFonte: boolean;
  competenciaReferencia: string | null;
  regimeReferencia: string | null;
  localidadeReferencia: string | null;
  ajusteValorBase: number | null;
  ajusteOperacao: OperacaoAjusteValor | null;
  ajusteQuantidade: number | null;
  ajusteUnidadeMedida: string | null;
  ajusteQuantidadeTR: number | null;
  ajustePeriodicidade: PeriodicidadeContrato | null;
  valorUnitarioAjustado: number | null;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function scoreVariant(score: number): "default" | "secondary" | "destructive" {
  if (score >= 70) return "default";
  if (score >= 40) return "secondary";
  return "destructive";
}

export function LinhaCandidatoSimilaridade({
  candidato,
  quantidadeItemTR,
  unidadeItemTR,
}: {
  candidato: CandidatoSimilaridadeView;
  quantidadeItemTR: number;
  unidadeItemTR: string;
}) {
  const [editando, setEditando] = useState(false);

  const temAjuste = candidato.valorUnitarioAjustado !== null;
  const valorExibido = candidato.valorUnitarioAjustado ?? candidato.valorUnitario;

  return (
    <>
      <TableRow>
        <TableCell className="whitespace-nowrap">{candidato.fonteOrgaoOuId}</TableCell>
        <TableCell className="max-w-xs truncate" title={candidato.fonteDescricao}>
          {candidato.fonteDescricao}
        </TableCell>
        <TableCell className="whitespace-nowrap font-mono tabular-nums">
          <span>
            {formatarMoeda(valorExibido)}
            {candidato.ajusteUnidadeMedida && (
              <span className="text-muted-foreground"> / {candidato.ajusteUnidadeMedida}</span>
            )}
          </span>
          {temAjuste && (
            <span
              className="block text-xs font-normal text-muted-foreground line-through"
              title="Valor publicado pela fonte, corrigido pelo analista"
            >
              {formatarMoeda(candidato.valorUnitario)}
            </span>
          )}
          {candidato.ajustePeriodicidade && (
            <span className="block font-sans text-xs font-normal text-muted-foreground">
              {PERIODICIDADE_LABEL[candidato.ajustePeriodicidade]}
            </span>
          )}
        </TableCell>
        <TableCell className="whitespace-nowrap">{candidato.dataFormatada}</TableCell>
        <TableCell>
          {candidato.tipoCandidato === "preco_referencia" ? (
            <ReferenciaSinapiInfo
              competencia={candidato.competenciaReferencia}
              regime={candidato.regimeReferencia}
              localidade={candidato.localidadeReferencia}
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          <Badge variant={scoreVariant(candidato.scoreFinal)}>
            {candidato.scoreFinal.toFixed(0)}
          </Badge>
        </TableCell>
        <TableCell>
          {candidato.fonteUrl ? (
            <a
              href={candidato.fonteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Abrir <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={temAjuste ? "secondary" : "ghost"}
              onClick={() => setEditando((v) => !v)}
              aria-expanded={editando}
              aria-label={`Ajustar valor de ${candidato.fonteOrgaoOuId}`}
            >
              <Calculator className="size-3.5" aria-hidden />
              {temAjuste ? "Ajustado" : "Ajustar valor"}
            </Button>
            <PromoverFonteButton
              resultadoId={candidato.id}
              jaPromovido={candidato.promovidoParaFonte}
            />
            {!candidato.promovidoParaFonte && <DescartarResultadoButton resultadoId={candidato.id} />}
          </div>
        </TableCell>
      </TableRow>
      {editando && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={8} className="p-2">
            <AjusteValorCandidatoForm
              resultadoId={candidato.id}
              valorUnitarioOriginal={candidato.valorUnitario}
              ajusteValorBase={candidato.ajusteValorBase}
              ajusteOperacao={candidato.ajusteOperacao}
              ajusteQuantidade={candidato.ajusteQuantidade}
              ajusteUnidadeMedida={candidato.ajusteUnidadeMedida}
              ajusteQuantidadeTR={candidato.ajusteQuantidadeTR}
              ajustePeriodicidade={candidato.ajustePeriodicidade}
              temAjuste={temAjuste}
              quantidadeItemTR={quantidadeItemTR}
              unidadeItemTR={unidadeItemTR}
              jaPromovido={candidato.promovidoParaFonte}
              onFechar={() => setEditando(false)}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
