"use client";

import { useState } from "react";
import { Calculator, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { PromoverFonteButton } from "@/components/processos/PromoverFonteButton";
import { DescartarResultadoButton } from "@/components/processos/DescartarResultadoButton";
import { ReferenciaSinapiInfo } from "@/components/processos/ReferenciaSinapiInfo";
import { VigenciaContratoCelula } from "@/components/processos/VigenciaContratoCelula";
import {
  PERIODICIDADE_LABEL,
  RoteiroCalculoEditor,
} from "@/components/processos/RoteiroCalculoEditor";

import { formatarMoeda } from "@/components/processos/parseNumeroBR";
import {
  GRANDEZA_LABEL,
  classificarGrandeza,
  type ParametrosTR,
  type PeriodicidadeContrato,
  type RoteiroCalculo,
} from "@/lib/domain/roteiroCalculo";
import { ehUrlGenericaPainel, linkOrigemDeHref, resolverLinkOrigem } from "@/lib/similaridade/linkOrigem";
import type { ContratoVigencia } from "@/lib/domain/contratosVigencia";


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
  dataReferenciaISO: string;
  scoreFinal: number;
  promovidoParaFonte: boolean;
  competenciaReferencia: string | null;
  regimeReferencia: string | null;
  localidadeReferencia: string | null;
  ajusteUnidadeMedida: string | null;
  ajustePeriodicidade: PeriodicidadeContrato | null;
  /** Valor que vale como preço deste candidato na série (null = sem roteiro). */
  valorConsiderado: number | null;
  roteiro: RoteiroCalculo | null;
  /** Contratos gerados pela contratação (M29). Vazio = buscado e não há, ou não buscado. */
  contratosVigencia: ContratoVigencia[];
  /** ISO de quando a vigência foi buscada; `null` = nunca. Distingue os dois vazios acima. */
  vigenciaBuscadaEm: string | null;
}

/**
 * Só contratação com link de edital do PNCP tem contrato consultável por aqui.
 * Painel de Preços e SINAPI não passam por este caminho — sem isto o botão
 * apareceria neles prometendo algo que a consulta não entrega (§9.40).
 */
function ehContratacaoPncp(fonteUrl: string | null): boolean {
  return /^https:\/\/pncp\.gov\.br\/app\/editais\/[^/]+\/[^/]+\/[^/]+$/.test(fonteUrl ?? "");
}

function scoreVariant(score: number): "default" | "secondary" | "destructive" {
  if (score >= 70) return "default";
  if (score >= 40) return "secondary";
  return "destructive";
}

export function LinhaCandidatoSimilaridade({
  candidato,
  tr,
}: {
  candidato: CandidatoSimilaridadeView;
  tr: ParametrosTR;
}) {
  const [editando, setEditando] = useState(false);

  const temRoteiro = candidato.roteiro !== null && candidato.valorConsiderado !== null;
  const valorExibido = candidato.valorConsiderado ?? candidato.valorUnitario;
  const grandeza = candidato.roteiro ? classificarGrandeza(candidato.roteiro.passos) : null;
  const origem =
    candidato.fonteUrl && !ehUrlGenericaPainel(candidato.fonteUrl)
      ? linkOrigemDeHref(candidato.fonteUrl, candidato.tipoCandidato)
      : resolverLinkOrigem(candidato.tipoCandidato, candidato.fonteUrl);

  return (
    <>
      <TableRow>
        <TableCell className="max-w-[10rem] whitespace-normal break-words text-xs text-muted-foreground">
          {candidato.fonteOrgaoOuId}
        </TableCell>
        <TableCell className="max-w-xs whitespace-normal break-words text-xs text-muted-foreground">
          {candidato.fonteDescricao}
        </TableCell>
        <TableCell className="whitespace-nowrap font-mono tabular-nums">
          <span>
            {formatarMoeda(valorExibido)}
            {candidato.ajusteUnidadeMedida && (
              <span className="text-muted-foreground"> / {candidato.ajusteUnidadeMedida}</span>
            )}
          </span>
          {temRoteiro && (
            <>
              <span
                className="block text-xs font-normal text-muted-foreground line-through"
                title="Valor publicado pela fonte, antes do roteiro de cálculo"
              >
                {formatarMoeda(candidato.valorUnitario)}
              </span>
              {grandeza && grandeza !== "unitario_contrato" && (
                <span className="block font-sans text-xs font-normal text-muted-foreground">
                  {GRANDEZA_LABEL[grandeza]}
                </span>
              )}
            </>
          )}
          {candidato.ajustePeriodicidade && (
            <span className="block font-sans text-xs font-normal text-muted-foreground">
              contrato: {PERIODICIDADE_LABEL[candidato.ajustePeriodicidade]}
            </span>
          )}
        </TableCell>
        <TableCell className="whitespace-nowrap align-top">
          {candidato.dataFormatada}
          {/* A vigência mora sob a homologação porque as três datas contam a
              mesma história em ordem: preço homologado, contrato começa,
              contrato termina. */}
          <VigenciaContratoCelula
            resultadoId={candidato.id}
            contratosIniciais={candidato.contratosVigencia}
            buscadaEm={candidato.vigenciaBuscadaEm}
            temLinkPncp={ehContratacaoPncp(candidato.fonteUrl)}
          />
        </TableCell>
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
          {origem ? (
            <a
              href={origem.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {origem.rotulo} <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant={temRoteiro ? "secondary" : "ghost"}
              onClick={() => setEditando((v) => !v)}
              aria-expanded={editando}
              aria-label={`Roteiro de cálculo de ${candidato.fonteOrgaoOuId}`}
            >
              <Calculator className="size-3.5" aria-hidden />
              {temRoteiro ? "Calculado" : "Calcular valor"}
            </Button>
            <PromoverFonteButton
              resultadoId={candidato.id}
              jaPromovido={candidato.promovidoParaFonte}
            />
            {!candidato.promovidoParaFonte && (
              <DescartarResultadoButton resultadoId={candidato.id} />
            )}
          </div>
        </TableCell>
      </TableRow>
      {editando && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={8} className="p-2 whitespace-normal">
            {/* `grid grid-cols-1` (Tailwind: track = minmax(0,1fr)) impede que o
                texto sem quebra da memória de cálculo dite a largura da célula —
                numa tabela de layout automático, um filho de bloco comum faria
                a linha (e a tabela inteira) crescer até caber o texto numa
                única linha, em vez de quebrar dentro do espaço disponível. */}
            <div className="grid grid-cols-1">
              <RoteiroCalculoEditor
                resultadoId={candidato.id}
                valorPublicado={candidato.valorUnitario}
                roteiroSalvo={candidato.roteiro}
                tr={tr}
                jaPromovido={candidato.promovidoParaFonte}
                candidato={{
                  orgao: candidato.fonteOrgaoOuId,
                  descricao: candidato.fonteDescricao,
                  url: candidato.fonteUrl,
                  dataReferenciaISO: candidato.dataReferenciaISO,
                }}
                periodicidadeSalva={candidato.ajustePeriodicidade}
                onFechar={() => setEditando(false)}
              />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
