import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaxaProcesso } from "@/lib/domain/indicadores/desempenho";

const MAX_PROCESSOS = 12;

/**
 * Taxa de resposta por processo (M30.d). Série única: uma cor (primária) para a barra, valores em
 * texto com tokens de texto, e o número escrito ao lado — a barra nunca é a única forma de ler o
 * valor.
 */
export function RespostaPorProcesso({ processos }: { processos: TaxaProcesso[] }) {
  const visiveis = processos.slice(0, MAX_PROCESSOS);
  const ocultos = processos.length - visiveis.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Taxa de resposta por processo</CardTitle>
        <p className="text-sm text-muted-foreground">
          Fornecedores consultados por e-mail no período, por processo. Contam orçamento e recusa;
          resposta ainda não confirmada e e-mail devolvido ficam fora.
        </p>
      </CardHeader>
      <CardContent className="pb-4">
        {visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma cotação enviada no período.</p>
        ) : (
          <ul className="space-y-2.5" aria-label="Taxa de resposta por processo">
            {visiveis.map((p) => (
              <li
                key={p.chave}
                title={`${p.processo}: ${p.respondidas} de ${p.enviadas} responderam (${p.taxa}%)`}
                className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 rounded-md px-1 py-0.5 hover:bg-muted/50"
              >
                <span className="truncate text-xs text-foreground">{p.processo}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(p.taxa, p.taxa > 0 ? 2 : 0)}%` }}
                  />
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  <span className="font-medium text-foreground">{p.taxa}%</span> · {p.respondidas}/
                  {p.enviadas}
                </span>
              </li>
            ))}
          </ul>
        )}
        {ocultos > 0 && (
          <p className="pt-2 text-xs text-muted-foreground">
            e mais {ocultos} {ocultos === 1 ? "processo" : "processos"} com menos consultas.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
