import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// "AAAA-MM" -> "mm/aaaa". Sem tentativa de adivinhar formato diferente —
// devolve o valor cru se não casar (nunca deveria acontecer, ver
// `provedorSinapi.ts`, mas não quebra a tela se acontecer).
function formatarCompetencia(competencia: string): string {
  const m = competencia.match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[2]}/${m[1]}` : competencia;
}

// Regime de desoneração do SINAPI: dois preços legítimos e simultâneos para o
// mesmo código (CLAUDE.md — regra de domínio, não só de UI, ver
// `PrecoReferencia.regime` no schema) — precisam ficar visualmente distintos.
const REGIME_LABEL: Record<string, string> = {
  desonerado: "Desonerado",
  nao_desonerado: "Não desonerado",
};

/**
 * Bloco de metadados de fonte de tabela de referência oficial (SINAPI — M17).
 * Só renderiza quando `tipoCandidato === "preco_referencia"` e ao menos um dos
 * três campos veio preenchido — as demais fontes (contratação pública, Painel
 * de Preços) não têm regime de desoneração nem localidade-capital.
 */
export function ReferenciaSinapiInfo({
  competencia,
  regime,
  localidade,
}: {
  competencia: string | null;
  regime: string | null;
  localidade: string | null;
}) {
  if (!competencia && !regime && !localidade) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {competencia && (
        <Badge variant="outline" className="font-mono tabular-nums">
          {formatarCompetencia(competencia)}
        </Badge>
      )}
      {regime && (
        <Badge
          className={cn(
            regime === "desonerado"
              ? "bg-success text-success-foreground"
              : "bg-warning text-warning-foreground",
            "border-transparent",
          )}
        >
          {REGIME_LABEL[regime] ?? regime}
        </Badge>
      )}
      {localidade && (
        <span
          className="text-muted-foreground"
          title="Localidade de referência do IBGE — a capital, não o estado inteiro"
        >
          {localidade} (capital)
        </span>
      )}
    </div>
  );
}
