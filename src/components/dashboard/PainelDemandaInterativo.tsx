"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  dataBr,
  numeroCurto,
  pct,
  processosDoKpi,
  rotuloDaCategoria,
  trechosDaFrase,
  variacaoEmNumero,
  variacaoEmPp,
  type KpiClicavel,
  type Tom,
  type Variacao,
} from "@/lib/domain/indicadores/formatosPainel";
import {
  type NivelProcesso,
  type PainelDemanda,
  type ProcessoDetalhado,
} from "@/lib/domain/indicadores/painelDemanda";
import type { ProcessoNoSistema } from "@/lib/indicadores/demanda";
import { cn } from "@/lib/utils";

const NIVEL: Record<NivelProcesso, { rotulo: string; classe: string }> = {
  critico: { rotulo: "Crítico", classe: "bg-destructive/10 text-destructive" },
  atencao: { rotulo: "Atenção", classe: "bg-warning/15 text-warning-strong" },
  normal: { rotulo: "Normal", classe: "bg-muted text-muted-foreground" },
};

function NivelBadge({ nivel }: { nivel: NivelProcesso }) {
  return <Badge className={NIVEL[nivel].classe}>{NIVEL[nivel].rotulo}</Badge>;
}

const TOM: Record<Tom, string> = {
  bom: "text-success",
  ruim: "text-danger",
  neutro: "text-muted-foreground",
};

function Variacao({ v, comparado }: { v: Variacao | null; comparado: string }) {
  if (!v) return <span className="text-xs text-muted-foreground">sem comparativo</span>;
  return (
    <span
      className={cn("text-xs font-medium tabular-nums", TOM[v.tom])}
      title={`Variação ${comparado}`}
    >
      {v.texto} <span className="font-normal text-muted-foreground">{comparado}</span>
    </span>
  );
}

/**
 * Ação dentro de uma frase. Um <button> é sempre um bloco em linha (não quebra com o texto ao redor); por isso o
 * processo citado na frase é um span com papel de botão, que acompanha o fluxo do texto e continua acessível
 * pelo teclado (Enter e espaço).
 */
function AcaoEmLinha({ onAbrir, children }: { onAbrir: () => void; children: React.ReactNode }) {
  return (
    <span
      role="button"
      tabIndex={0}
      className="cursor-pointer text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir();
        }
      }}
    >
      {children}
    </span>
  );
}

const dias = (n: number | null) => (n === null ? "—" : `${numeroCurto(n)} d`);

type Visao =
  | { tipo: "kpi"; kpi: KpiClicavel }
  | { tipo: "processo"; chave: string; voltarPara: KpiClicavel | null };

const LISTA_KPI: Record<KpiClicavel, { titulo: (p: PainelDemanda) => string; descricao: string }> =
  {
    devolucoes: {
      titulo: (p) => `Onde estão as ${p.atual.devolucoes} devoluções`,
      descricao: "Processos ordenados pelo número de devoluções.",
    },
    devolvidos: {
      titulo: (p) => `Processos devolvidos (${p.atual.processosDevolvidos})`,
      descricao: "Mais de 3 passagens, do que mais voltou ao que menos.",
    },
    passagens: {
      titulo: () => "Passagens por processo",
      descricao: "Todos os processos, do que mais voltou ao que menos.",
    },
    intervalo: {
      titulo: () => "Intervalo entre passagens",
      descricao: "Maior intervalo mediano primeiro (processos com 2 ou mais passagens).",
    },
  };

export function PainelDemandaInterativo({
  painel,
  noSistema,
}: {
  painel: PainelDemanda;
  noSistema: Record<string, ProcessoNoSistema>;
}) {
  const [visao, setVisao] = useState<Visao | null>(null);
  const { atual, anterior } = painel;
  const comparado = painel.parcial
    ? `vs. ${painel.ano - 1} no mesmo período`
    : `vs. ${painel.ano - 1}`;
  const processoAberto =
    visao?.tipo === "processo"
      ? (painel.processos.find((p) => p.chave === visao.chave) ?? null)
      : null;

  const kpis: {
    id: KpiClicavel;
    rotulo: string;
    valor: string;
    variacao: Variacao | null;
    nota: string;
  }[] = [
    {
      id: "devolucoes",
      rotulo: "Taxa de devolução",
      valor: pct(atual.taxaDevolucao),
      variacao: variacaoEmPp(atual.taxaDevolucao, anterior?.taxaDevolucao ?? null, true),
      nota: `${atual.devolucoes} devoluções em ${atual.remessas} remessas (passagens além da 3ª)`,
    },
    {
      id: "devolvidos",
      rotulo: "Processos devolvidos",
      valor: `${atual.processosDevolvidos} de ${atual.processos}`,
      variacao: variacaoEmPp(
        atual.pctProcessosDevolvidos,
        anterior?.pctProcessosDevolvidos ?? null,
        true,
      ),
      nota: `${pct(atual.pctProcessosDevolvidos)} dos processos tiveram mais de 3 passagens`,
    },
    {
      id: "passagens",
      rotulo: "Passagens por processo",
      valor: numeroCurto(atual.mediaPassagens),
      variacao: variacaoEmNumero(atual.mediaPassagens, anterior?.mediaPassagens ?? null, true),
      nota: `média · pior caso: ${atual.maxPassagens} passagens`,
    },
    {
      id: "intervalo",
      rotulo: "Intervalo mediano entre passagens",
      valor:
        atual.intervaloMedianoDias === null
          ? "—"
          : `${numeroCurto(atual.intervaloMedianoDias)} dias`,
      variacao:
        atual.intervaloMedianoDias === null
          ? null
          : variacaoEmNumero(
              atual.intervaloMedianoDias,
              anterior?.intervaloMedianoDias ?? null,
              true,
              " dias",
            ),
      nota: "mediana em dias corridos; no mesmo dia vale 0",
    },
  ];

  return (
    <div className="space-y-6">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores de demanda">
        {kpis.map((k) => (
          <li key={k.id}>
            <button
              type="button"
              onClick={() => setVisao({ tipo: "kpi", kpi: k.id })}
              className="h-full w-full rounded-xl text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`${k.rotulo}: ${k.valor}. Ver os processos.`}
            >
              <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {k.rotulo}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-2xl font-semibold tabular-nums">{k.valor}</span>
                    <Variacao v={k.variacao} comparado={comparado} />
                  </div>
                  <p className="text-xs text-muted-foreground">{k.nota}</p>
                </CardContent>
              </Card>
            </button>
          </li>
        ))}
      </ul>

      <section aria-labelledby="o-que-mudou" className="space-y-2">
        <h3
          id="o-que-mudou"
          className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          O que mudou
        </h3>
        <Card>
          <CardContent className="pt-4">
            {painel.frases.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {painel.parcial
                  ? "Ainda não há movimento suficiente nos últimos dias para comparar."
                  : `${painel.ano} é um ano fechado: as frases de “o que mudou” valem só para o ano corrente.`}
              </p>
            ) : (
              <ul className="space-y-2">
                {painel.frases.map((f) => {
                  const Icone =
                    f.tendencia === "piora"
                      ? TrendingUp
                      : f.tendencia === "melhora"
                        ? TrendingDown
                        : Minus;
                  const cor =
                    f.tendencia === "piora"
                      ? "text-danger"
                      : f.tendencia === "melhora"
                        ? "text-success"
                        : "text-muted-foreground";
                  const leitura =
                    f.tendencia === "piora"
                      ? "Piorou"
                      : f.tendencia === "melhora"
                        ? "Melhorou"
                        : "Informação";
                  return (
                    <li
                      key={f.codigo}
                      className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                    >
                      <Icone className={cn("mt-0.5 size-4 shrink-0", cor)} aria-hidden />
                      <span className="sr-only">{leitura}: </span>
                      <span>
                        {trechosDaFrase(f).map((x, i) =>
                          x.tipo === "forte" ? (
                            <strong key={i}>{x.texto}</strong>
                          ) : x.tipo === "processo" ? (
                            <AcaoEmLinha
                              key={i}
                              onAbrir={() =>
                                setVisao({ tipo: "processo", chave: x.chave, voltarPara: null })
                              }
                            >
                              {x.texto}
                            </AcaoEmLinha>
                          ) : (
                            <span key={i}>{x.texto}</span>
                          ),
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Frases geradas por regras fixas sobre as remessas; cada uma traz o número que a
              sustenta.
            </p>
          </CardContent>
        </Card>
      </section>

      <ProcessosQueMaisVoltaram
        painel={painel}
        onAbrir={(chave) => setVisao({ tipo: "processo", chave, voltarPara: null })}
      />
      <MetricasPorProcesso
        painel={painel}
        onAbrir={(chave) => setVisao({ tipo: "processo", chave, voltarPara: null })}
      />

      <Sheet open={visao !== null} onOpenChange={(aberto) => !aberto && setVisao(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {visao?.tipo === "kpi" && (
            <ListaDoKpi
              painel={painel}
              kpi={visao.kpi}
              onAbrir={(chave) => setVisao({ tipo: "processo", chave, voltarPara: visao.kpi })}
            />
          )}
          {visao?.tipo === "processo" && (
            <DetalheDoProcesso
              processo={processoAberto}
              parcial={painel.parcial}
              noSistema={noSistema}
              onVoltar={
                visao.voltarPara ? () => setVisao({ tipo: "kpi", kpi: visao.voltarPara! }) : null
              }
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ------------------------------------------------------------------ tabelas

function ProcessosQueMaisVoltaram({
  painel,
  onAbrir,
}: {
  painel: PainelDemanda;
  onAbrir: (chave: string) => void;
}) {
  const topo = painel.processos.slice(0, 15);
  return (
    <section aria-labelledby="mais-voltaram" className="space-y-2">
      <h3
        id="mais-voltaram"
        className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Processos que mais voltaram{" "}
        <span className="font-normal normal-case">
          ({topo.length} de {painel.atual.processos})
        </span>
      </h3>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">Processo</th>
                <th className="px-4 py-2 text-right font-medium">Passagens</th>
                <th className="px-4 py-2 text-right font-medium">Devoluções</th>
                <th className="px-4 py-2 font-medium">Nível</th>
                <th className="px-4 py-2 text-right font-medium">Intervalo mediano</th>
                <th className="px-4 py-2 text-right font-medium">Última passagem</th>
              </tr>
            </thead>
            <tbody>
              {topo.map((p, i) => (
                <tr key={p.chave} className="border-t">
                  <td className="px-4 py-1.5 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-4 py-1.5">
                    <button
                      type="button"
                      className="text-left text-primary hover:underline"
                      onClick={() => onAbrir(p.chave)}
                    >
                      {p.rotulo}
                    </button>
                  </td>
                  <td className="px-4 py-1.5 text-right font-semibold tabular-nums">
                    {p.passagens}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{p.devolucoes}</td>
                  <td className="px-4 py-1.5">
                    <NivelBadge nivel={p.nivel} />
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">
                    {dias(p.intervaloMedianoDias)}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{dataBr(p.ultima)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
}

type Coluna =
  | "rotulo"
  | "passagens"
  | "devolucoes"
  | "primeira"
  | "ultima"
  | "intervaloMediano"
  | "maiorIntervalo"
  | "semNova";

const VALOR_DA_COLUNA: Record<Coluna, (p: ProcessoDetalhado) => number | string> = {
  rotulo: (p) => p.rotulo,
  passagens: (p) => p.passagens,
  devolucoes: (p) => p.devolucoes,
  primeira: (p) => p.primeira,
  ultima: (p) => p.ultima,
  intervaloMediano: (p) => p.intervaloMedianoDias ?? -1,
  maiorIntervalo: (p) => p.maiorIntervaloDias ?? -1,
  semNova: (p) => p.diasSemNovaPassagem ?? -1,
};

function MetricasPorProcesso({
  painel,
  onAbrir,
}: {
  painel: PainelDemanda;
  onAbrir: (chave: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [nivel, setNivel] = useState<"" | NivelProcesso>("");
  const [ordem, setOrdem] = useState<{ coluna: Coluna; desc: boolean }>({
    coluna: "passagens",
    desc: true,
  });

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = painel.processos.filter(
      (p) =>
        (!nivel || p.nivel === nivel) &&
        (!termo || `${p.rotulo} ${rotuloDaCategoria(p.categoria)}`.toLowerCase().includes(termo)),
    );
    const valor = VALOR_DA_COLUNA[ordem.coluna];
    return lista.sort((a, b) => {
      const x = valor(a);
      const y = valor(b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return (ordem.desc ? -c : c) || a.chave.localeCompare(b.chave);
    });
  }, [painel.processos, busca, nivel, ordem]);

  const cabecalho = (coluna: Coluna, texto: string, direita = false) => {
    const ativa = ordem.coluna === coluna;
    return (
      <th
        className={cn(
          "px-2 py-2 font-medium whitespace-nowrap",
          direita && "text-right",
          coluna === "rotulo" && "min-w-[19rem]",
        )}
        aria-sort={ativa ? (ordem.desc ? "descending" : "ascending") : "none"}
      >
        <button
          type="button"
          className="hover:text-foreground"
          onClick={() => setOrdem({ coluna, desc: ativa ? !ordem.desc : true })}
        >
          {texto}
          {ativa ? (ordem.desc ? " ▼" : " ▲") : ""}
        </button>
      </th>
    );
  };

  return (
    <section aria-labelledby="por-processo" className="space-y-2">
      <h3
        id="por-processo"
        className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Métricas por processo
      </h3>
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Buscar processo
              <Input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="número, tipo ou volume"
                className="h-8 w-56"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Nível
              <select
                value={nivel}
                onChange={(e) => setNivel(e.target.value as "" | NivelProcesso)}
                className="h-8 rounded-lg border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <option value="">Todos</option>
                <option value="critico">Crítico (7 ou mais)</option>
                <option value="atencao">Atenção (4 a 6)</option>
                <option value="normal">Normal (até 3)</option>
              </select>
            </label>
            <span className="pb-1.5 text-xs text-muted-foreground" role="status">
              {linhas.length} {linhas.length === 1 ? "processo" : "processos"}
            </span>
          </div>
          <div className="max-h-[32rem] overflow-auto rounded-md border">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr>
                  {cabecalho("rotulo", "Processo")}
                  {cabecalho("passagens", "Passagens", true)}
                  {cabecalho("devolucoes", "Devoluções", true)}
                  <th className="px-2 py-2 font-medium">Nível</th>
                  {cabecalho("primeira", "1ª passagem", true)}
                  {cabecalho("ultima", "Última", true)}
                  {cabecalho("intervaloMediano", "Interv. mediano", true)}
                  {cabecalho("maiorIntervalo", "Maior interv.", true)}
                  {painel.parcial && cabecalho("semNova", "Sem nova há", true)}
                </tr>
              </thead>
              <tbody>
                {linhas.map((p) => (
                  <tr key={p.chave} className="border-t">
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        className="text-left text-primary hover:underline"
                        onClick={() => onAbrir(p.chave)}
                      >
                        {p.rotulo}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                      {p.passagens}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.devolucoes}</td>
                    <td className="px-2 py-1.5">
                      <NivelBadge nivel={p.nivel} />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{dataBr(p.primeira)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{dataBr(p.ultima)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {dias(p.intervaloMedianoDias)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {dias(p.maiorIntervaloDias)}
                    </td>
                    {painel.parcial && (
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {dias(p.diasSemNovaPassagem)}
                      </td>
                    )}
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-2 py-6 text-center text-muted-foreground">
                      Nenhum processo com esses filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Intervalos em dias corridos. “Sem nova há” não indica que o processo terminou: as
            remessas não registram conclusão.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

// ------------------------------------------------------------------ gaveta

function ListaDoKpi({
  painel,
  kpi,
  onAbrir,
}: {
  painel: PainelDemanda;
  kpi: KpiClicavel;
  onAbrir: (chave: string) => void;
}) {
  const lista = processosDoKpi(painel.processos, kpi);
  const LIMITE = 60;
  return (
    <>
      <SheetHeader>
        <SheetTitle>{LISTA_KPI[kpi].titulo(painel)}</SheetTitle>
        <SheetDescription>{LISTA_KPI[kpi].descricao}</SheetDescription>
      </SheetHeader>
      <div className="px-4 pb-4">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">Processo</th>
              <th className="py-2 text-right font-medium">Passagens</th>
              <th className="py-2 text-right font-medium">Devol.</th>
              <th className="py-2 text-right font-medium">Interv. mediano</th>
            </tr>
          </thead>
          <tbody>
            {lista.slice(0, LIMITE).map((p) => (
              <tr key={p.chave} className="border-t">
                <td className="py-1.5 pr-2">
                  <button
                    type="button"
                    className="text-left text-primary hover:underline"
                    onClick={() => onAbrir(p.chave)}
                  >
                    {p.rotulo}
                  </button>
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{p.passagens}</td>
                <td className="py-1.5 text-right tabular-nums">{p.devolucoes}</td>
                <td className="py-1.5 text-right tabular-nums">{dias(p.intervaloMedianoDias)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">Nenhum processo neste recorte.</p>
        )}
        {lista.length > LIMITE && (
          <p className="pt-3 text-xs text-muted-foreground">
            Mostrando {LIMITE} de {lista.length}. A tabela “Métricas por processo” traz todos.
          </p>
        )}
      </div>
    </>
  );
}

function DetalheDoProcesso({
  processo,
  parcial,
  noSistema,
  onVoltar,
}: {
  processo: ProcessoDetalhado | null;
  parcial: boolean;
  noSistema: Record<string, ProcessoNoSistema>;
  onVoltar: (() => void) | null;
}) {
  if (!processo) {
    return (
      <SheetHeader>
        <SheetTitle>Processo não encontrado</SheetTitle>
        <SheetDescription>
          Ele não tem remessas neste ano e neste filtro de categoria.
        </SheetDescription>
      </SheetHeader>
    );
  }
  const noSis = noSistema[processo.chave];
  const maior = Math.max(1, ...processo.historico.map((h) => h.intervaloDias ?? 0));
  const mini: [string, string][] = [
    ["Passagens", String(processo.passagens)],
    ["Devoluções (além da 3ª)", String(processo.devolucoes)],
    ["Intervalo mediano", dias(processo.intervaloMedianoDias)],
    ["Maior intervalo", dias(processo.maiorIntervaloDias)],
  ];
  return (
    <>
      <SheetHeader>
        <SheetTitle>{processo.rotulo}</SheetTitle>
        <SheetDescription>
          Processo {processo.chave} · {rotuloDaCategoria(processo.categoria)}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <NivelBadge nivel={processo.nivel} />
          <span>1ª passagem: {dataBr(processo.primeira)}</span>
          <span>· última: {dataBr(processo.ultima)}</span>
          {parcial && processo.diasSemNovaPassagem !== null && (
            <span>· sem nova passagem há {processo.diasSemNovaPassagem} dias</span>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {mini.map(([rotulo, valor]) => (
            <div key={rotulo} className="rounded-lg border p-2">
              <dd className="text-lg font-semibold tabular-nums">{valor}</dd>
              <dt className="text-xs text-muted-foreground">{rotulo}</dt>
            </div>
          ))}
        </dl>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">#</th>
              <th className="py-2 pr-3 font-medium">Data</th>
              <th className="py-2 font-medium">Situação</th>
              <th className="py-2 text-right font-medium">Desde a anterior</th>
              <th className="w-1/3 py-2" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {processo.historico.map((h, i) => (
              <tr key={i} className="border-t">
                <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{i + 1}</td>
                <td className="py-1.5 pr-3 tabular-nums">{dataBr(h.data)}</td>
                <td className="py-1.5">
                  {h.devolucao ? (
                    <Badge className="bg-destructive/10 text-destructive">devolução</Badge>
                  ) : (
                    <Badge variant="outline">obrigatória</Badge>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">{dias(h.intervaloDias)}</td>
                <td className="py-1.5 pl-2" aria-hidden>
                  {h.intervaloDias !== null && (
                    <span className="block h-2 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${(h.intervaloDias / maior) * 100}%` }}
                      />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-3">
          {noSis ? (
            <Link href={`/processos/${noSis.id}`} className="text-sm text-primary hover:underline">
              Abrir o processo {noSis.numero} no sistema
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">
              Este processo ainda não está cadastrado no sistema.
            </span>
          )}
          {onVoltar && (
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={onVoltar}
            >
              ← Voltar à lista
            </button>
          )}
        </div>
      </div>
    </>
  );
}
