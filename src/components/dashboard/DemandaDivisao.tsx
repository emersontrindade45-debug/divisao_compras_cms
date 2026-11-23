import Link from "next/link";
import { Inbox, Repeat, RotateCcw, Layers } from "lucide-react";
import { MetricCard } from "@/components/common/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResultadoDemanda } from "@/lib/indicadores/demanda";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** "2026-11-17" → "17/11/2026", sem passar por Date (não depende de fuso). */
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

const numero = (n: number) => n.toLocaleString("pt-BR");

/**
 * Demanda da Divisão (M30.e): quantos processos chegaram no ano, quantas vezes voltaram e a lista dos
 * processos distintos. Lê a planilha de remessas, que o sistema não controla — por isso há um estado
 * para cada falha ("não configurada", "indisponível") e nenhum deles mostra zero como se fosse fato.
 */
export function DemandaDivisao({ resultado, ano }: { resultado: ResultadoDemanda; ano: number }) {
  if (resultado.estado === "nao_configurada") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        A planilha de demanda ainda não foi configurada neste ambiente.
      </p>
    );
  }
  if (resultado.estado === "indisponivel") {
    return (
      <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
        Não foi possível carregar a demanda da Divisão agora. {resultado.motivo}
      </p>
    );
  }

  const { demanda, noSistema, descartadas, duplicadas } = resultado;
  if (demanda.remessas === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma remessa registrada em {ano}.</p>;
  }
  const pctVoltaram = Math.round((demanda.processosQueVoltaram / demanda.processosDistintos) * 100);
  const maxMes = Math.max(...demanda.porMes.map((m) => m.remessas), 1);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Processos distintos"
          value={numero(demanda.processosDistintos)}
          hint={`chegaram à Divisão em ${ano}`}
          icon={Layers}
        />
        <MetricCard label="Remessas" value={numero(demanda.remessas)} hint="cada chegada de um processo" icon={Inbox} />
        <MetricCard
          label="Processos que voltaram"
          value={numero(demanda.processosQueVoltaram)}
          hint={`${pctVoltaram}% dos distintos · ${numero(demanda.remessasExtras)} remessas extras`}
          icon={RotateCcw}
        />
        <MetricCard
          label="Remessas por processo"
          value={demanda.mediaRemessas.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}
          hint="média no ano"
          icon={Repeat}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Remessas por mês</CardTitle>
          <p className="text-sm text-muted-foreground">
            Remessas e processos distintos em cada mês de {ano}.
          </p>
        </CardHeader>
        <CardContent className="pb-4">
          <ul className="space-y-2" aria-label="Remessas por mês">
            {demanda.porMes.map((m) => (
              <li
                key={m.mes}
                title={`${MESES[m.mes - 1]}: ${m.remessas} remessas de ${m.distintos} processos distintos`}
                className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 text-xs"
              >
                <span className="text-muted-foreground">{MESES[m.mes - 1]}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.max((m.remessas / maxMes) * 100, m.remessas > 0 ? 2 : 0)}%` }}
                  />
                </span>
                <span className="tabular-nums text-muted-foreground">
                  <span className="font-medium text-foreground">{numero(m.remessas)}</span> · {numero(m.distintos)}{" "}
                  proc.
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <details className="rounded-lg border">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Lista de processos distintos ({numero(demanda.processosDistintos)})
        </summary>
        <div className="overflow-x-auto border-t">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Processo</th>
                <th className="px-4 py-2 text-right font-medium">Remessas</th>
                <th className="px-4 py-2 font-medium">Primeira</th>
                <th className="px-4 py-2 font-medium">Última</th>
              </tr>
            </thead>
            <tbody>
              {demanda.processos.map((p) => {
                const noSis = noSistema[p.chave];
                return (
                  <tr key={p.chave} className="border-t">
                    <td className="px-4 py-1.5">
                      {noSis ? (
                        <Link href={`/processos/${noSis.id}`} className="text-primary hover:underline">
                          {p.rotulo}
                        </Link>
                      ) : (
                        p.rotulo
                      )}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{numero(p.remessas)}</td>
                    <td className="px-4 py-1.5 tabular-nums">{dataBr(p.primeira)}</td>
                    <td className="px-4 py-1.5 tabular-nums">{dataBr(p.ultima)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>

      <p className="text-xs text-muted-foreground">
        Última remessa em {demanda.ultimaRemessa ? dataBr(demanda.ultimaRemessa) : "—"}. A planilha é atualizada de
        hora em hora.
        {descartadas > 0 && ` ${numero(descartadas)} linha(s) ignorada(s) por formato não reconhecido.`}
        {duplicadas > 0 && ` ${numero(duplicadas)} remessa(s) repetida(s) contada(s) uma vez.`}
      </p>
    </div>
  );
}
