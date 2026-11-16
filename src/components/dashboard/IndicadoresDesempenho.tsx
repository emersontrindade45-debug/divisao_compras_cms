import { CheckCircle2, Clock, FileX, Landmark, Layers, Mail } from "lucide-react";
import { MetricCard } from "@/components/common/MetricCard";
import {
  textoCobertura,
  variacao,
  type Indicador,
} from "@/lib/domain/indicadores/desempenho";
import type { CamadaDesempenho, ParIndicador } from "@/lib/indicadores/desempenho";

const PROCESSOS = { singular: "processo", plural: "processos" };
const COTACOES = { singular: "cotação", plural: "cotações" };
const PROPOSTAS = { singular: "proposta", plural: "propostas" };
const ITENS = { singular: "item", plural: "itens" };

function valor(ind: Indicador, sufixo: string): string {
  return ind.valor === null ? "—" : `${ind.valor.toLocaleString("pt-BR")}${sufixo}`;
}

function delta(par: ParIndicador, sentido: "menor_melhor" | "maior_melhor", sufixo: string) {
  const v = variacao(par.atual, par.anterior, sentido);
  if (!v) return undefined;
  const seta = v.diferenca > 0 ? "▲" : "▼";
  return {
    value: `${seta} ${Math.abs(v.diferenca).toLocaleString("pt-BR")}${sufixo} vs. anterior`,
    positive: v.melhorou,
  };
}

/** Os seis indicadores do PRD (M30.b), cada um com cobertura e comparação. */
export function IndicadoresDesempenho({ dados }: { dados: CamadaDesempenho }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MetricCard
        label="Tempo até a 1ª referência"
        value={valor(dados.tempoPrimeiraReferencia.atual, " dias")}
        delta={delta(dados.tempoPrimeiraReferencia, "menor_melhor", "d")}
        hint={`mediana · ${textoCobertura(dados.tempoPrimeiraReferencia.atual, PROCESSOS, "sem data confiável")}`}
        icon={Clock}
      />
      <MetricCard
        label="Processos com fonte pública"
        value={valor(dados.fontePublica.atual, "%")}
        delta={delta(dados.fontePublica, "maior_melhor", " p.p.")}
        hint={textoCobertura(dados.fontePublica.atual, PROCESSOS, "ainda sem preço")}
        icon={Landmark}
      />
      <MetricCard
        label="Taxa de resposta"
        value={valor(dados.taxaResposta.atual, "%")}
        delta={delta(dados.taxaResposta, "maior_melhor", " p.p.")}
        hint={textoCobertura(dados.taxaResposta.atual, COTACOES)}
        icon={Mail}
        href="/cotacoes"
      />
      <MetricCard
        label="Tempo até a série mínima"
        value={valor(dados.tempoSerieMinima.atual, " dias")}
        delta={delta(dados.tempoSerieMinima, "menor_melhor", "d")}
        hint={`mediana · ${textoCobertura(dados.tempoSerieMinima.atual, PROCESSOS, "sem data confiável")}`}
        icon={CheckCircle2}
      />
      <MetricCard
        label="Propostas invalidadas"
        value={valor(dados.propostasInvalidas.atual, "%")}
        delta={delta(dados.propostasInvalidas, "menor_melhor", " p.p.")}
        hint={textoCobertura(dados.propostasInvalidas.atual, PROPOSTAS)}
        icon={FileX}
      />
      <MetricCard
        label="Preços pesquisados até a suficiência"
        value={valor(dados.fontesAteSuficiencia.atual, "")}
        delta={delta(dados.fontesAteSuficiencia, "menor_melhor", "")}
        hint={`média por item · ${textoCobertura(dados.fontesAteSuficiencia.atual, ITENS, "ainda sem 3 preços")}`}
        icon={Layers}
      />
    </div>
  );
}
