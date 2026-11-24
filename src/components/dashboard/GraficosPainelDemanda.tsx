import {
  MESES_CURTOS,
  barrasDeCategoria,
  numeroCurto,
  pct,
  proporcaoEmPct,
} from "@/lib/domain/indicadores/formatosPainel";
import type { MesSerie, PainelDemanda } from "@/lib/domain/indicadores/painelDemanda";
import { Card, CardContent } from "@/components/ui/card";

type Campo = "remessas" | "devolucoes";

function BarrasPorMes({
  titulo,
  campo,
  atual,
  anterior,
  anoAtual,
  anoAnterior,
}: {
  titulo: string;
  campo: Campo;
  atual: MesSerie[];
  anterior: MesSerie[] | null;
  anoAtual: number;
  anoAnterior: number;
}) {
  const maximo = Math.max(1, ...atual.map((m) => m[campo]), ...(anterior ?? []).map((m) => m[campo]));
  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
        <span>{titulo}</span>
        <span className="flex items-center gap-3 text-xs font-normal text-muted-foreground">
          <span className="flex items-center gap-1">
            <span aria-hidden className="inline-block size-2.5 rounded-sm bg-primary" />
            {anoAtual}
          </span>
          {anterior && (
            <span className="flex items-center gap-1">
              <span aria-hidden className="inline-block size-2.5 rounded-sm bg-muted-foreground/40" />
              {anoAnterior}
            </span>
          )}
        </span>
      </figcaption>
      <div className="flex h-36 items-end gap-1" role="img" aria-label={`${titulo}: ${anoAtual}${anterior ? ` e ${anoAnterior}` : ""}, por mês. Valores na tabela abaixo.`}>
        {atual.map((m, i) => {
          const antes = anterior?.[i];
          return (
            <div key={m.mes} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
              <div className="flex h-full items-end justify-center gap-px">
                {antes && (
                  <div
                    className="w-1/2 rounded-t-sm bg-muted-foreground/40"
                    style={{ height: `${proporcaoEmPct(antes[campo], maximo)}%` }}
                    title={`${MESES_CURTOS[i]}/${anoAnterior}: ${antes[campo]}`}
                  />
                )}
                <div
                  className={antes ? "w-1/2 rounded-t-sm bg-primary" : "w-3/4 rounded-t-sm bg-primary"}
                  style={{ height: `${proporcaoEmPct(m[campo], maximo)}%` }}
                  title={`${MESES_CURTOS[i]}/${anoAtual}: ${m[campo]}`}
                />
              </div>
              <span className="text-center text-[10px] text-muted-foreground">{MESES_CURTOS[i]}</span>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>{titulo}</caption>
        <thead>
          <tr>
            <th>Mês</th>
            <th>{anoAtual}</th>
            {anterior && <th>{anoAnterior}</th>}
          </tr>
        </thead>
        <tbody>
          {atual.map((m, i) => (
            <tr key={m.mes}>
              <td>{MESES_CURTOS[i]}</td>
              <td>{m[campo]}</td>
              {anterior && <td>{anterior[i]![campo]}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function TaxaPorCategoria({ painel }: { painel: PainelDemanda }) {
  const barras = barrasDeCategoria(painel.porCategoria);
  if (painel.categoria || barras.length === 0) return null;
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">Taxa de devolução por tipo de processo</figcaption>
      <ul className="space-y-2">
        {barras.map((b) => (
          <li key={b.categoria} className="space-y-0.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
              <span>
                {b.rotulo}{" "}
                <span className="text-xs text-muted-foreground">
                  ({numeroCurto(b.remessas)} remessas)
                </span>
              </span>
              <span className="tabular-nums">
                <strong>{pct(b.taxa)}</strong>
                {b.taxaAnterior !== null && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    {painel.ano - 1}: {pct(b.taxaAnterior)}
                  </span>
                )}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted" aria-hidden>
              <div
                className={b.amostraPequena ? "h-2 rounded-full bg-primary/40" : "h-2 rounded-full bg-primary"}
                style={{ width: `${b.larguraPct}%` }}
              />
            </div>
            {b.amostraPequena && (
              <p className="text-xs text-muted-foreground">
                Amostra pequena (menos de 20 remessas): não compare com as outras.
              </p>
            )}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Gráficos da etapa 3: remessas e devoluções por mês (com o ano anterior) e taxa por tipo de processo. */
export function GraficosPainelDemanda({ painel }: { painel: PainelDemanda }) {
  return (
    <section aria-labelledby="graficos-demanda" className="space-y-2 print:hidden">
      <h3 id="graficos-demanda" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Evolução no ano
      </h3>
      <Card>
        <CardContent className="grid gap-6 pt-4 lg:grid-cols-2">
          <BarrasPorMes titulo="Remessas por mês" campo="remessas" atual={painel.serie.atual} anterior={painel.serie.anterior} anoAtual={painel.ano} anoAnterior={painel.ano - 1} />
          <BarrasPorMes titulo="Devoluções por mês" campo="devolucoes" atual={painel.serie.atual} anterior={painel.serie.anterior} anoAtual={painel.ano} anoAnterior={painel.ano - 1} />
          <div className="lg:col-span-2">
            <TaxaPorCategoria painel={painel} />
          </div>
        </CardContent>
      </Card>
      {painel.parcial && (
        <p className="text-xs text-muted-foreground">
          {painel.ano - 1} aparece inteiro; {painel.ano} só vai até {MESES_CURTOS[Number(painel.hoje.slice(5, 7)) - 1]}.
        </p>
      )}
    </section>
  );
}
