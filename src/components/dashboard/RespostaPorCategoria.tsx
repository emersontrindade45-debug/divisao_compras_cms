import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaxaCategoria } from "@/lib/domain/indicadores/desempenho";

const MAX_CATEGORIAS = 8;

/**
 * Taxa de resposta por categoria de fornecedor (M30.b). Série única: uma cor
 * (primária) para a barra, valores em texto com tokens de texto, e o número
 * escrito ao lado — a barra nunca é a única forma de ler o valor.
 */
export function RespostaPorCategoria({ categorias }: { categorias: TaxaCategoria[] }) {
  const visiveis = categorias.slice(0, MAX_CATEGORIAS);
  const ocultas = categorias.length - visiveis.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Taxa de resposta por categoria</CardTitle>
        <p className="text-sm text-muted-foreground">
          Cotações enviadas no período, pelas categorias do fornecedor. Recusa conta como resposta.
        </p>
      </CardHeader>
      <CardContent className="pb-4">
        {visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma cotação enviada no período.</p>
        ) : (
          <ul className="space-y-2.5" aria-label="Taxa de resposta por categoria">
            {visiveis.map((c) => (
              <li
                key={c.categoria}
                title={`${c.categoria}: ${c.respondidas} de ${c.enviadas} responderam (${c.taxa}%)`}
                className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-md px-1 py-0.5 hover:bg-muted/50"
              >
                <span className="truncate text-xs text-foreground">{c.categoria}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(c.taxa, c.taxa > 0 ? 2 : 0)}%` }}
                  />
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  <span className="font-medium text-foreground">{c.taxa}%</span> · {c.respondidas}/
                  {c.enviadas}
                </span>
              </li>
            ))}
          </ul>
        )}
        {ocultas > 0 && (
          <p className="pt-2 text-xs text-muted-foreground">
            e mais {ocultas} {ocultas === 1 ? "categoria" : "categorias"} com menos cotações.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
