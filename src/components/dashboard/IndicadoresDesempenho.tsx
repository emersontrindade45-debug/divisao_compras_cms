import { Ban, CheckCircle2, HelpCircle, Clock, FileX, Landmark, Layers, Mail, MailX, Timer } from "lucide-react";
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
const RESPOSTAS = { singular: "resposta", plural: "respostas" };
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        label="Dúvidas"
        value={valor(dados.duvidas.atual, "%")}
        delta={delta(dados.duvidas, "maior_melhor", " p.p.")}
        hint={`${dados.contagem.duvidas} de ${dados.contagem.consultadas} consultas · pediram esclarecimento`}
        icon={HelpCircle}
        href="/cotacoes"
      />
      <MetricCard
        label="Orçamentos entregues"
        value={valor(dados.orcamentos.atual, "%")}
        delta={delta(dados.orcamentos, "maior_melhor", " p.p.")}
        hint={`${dados.contagem.orcamentos} de ${dados.contagem.consultadas} consultas · ${dados.contagem.aConfirmar} aguardando confirmação`}
        icon={Mail}
        href="/cotacoes"
      />
      <MetricCard
        label="Recusas"
        value={valor(dados.recusas.atual, "%")}
        delta={delta(dados.recusas, "menor_melhor", " p.p.")}
        hint={`${dados.contagem.recusas} de ${dados.contagem.consultadas} consultas · e-mails devolvidos fora da conta`}
        icon={Ban}
        href="/cotacoes"
      />
      <MetricCard
        label="Tempo de resposta do fornecedor"
        value={valor(dados.tempoResposta.atual, " dias")}
        delta={delta(dados.tempoResposta, "menor_melhor", "d")}
        hint={`mediana · ${textoCobertura(dados.tempoResposta.atual, RESPOSTAS)}`}
        icon={Timer}
      />
      <MetricCard
        label="E-mails que voltaram"
        value={valor(dados.emailsInvalidos.atual, "%")}
        delta={delta(dados.emailsInvalidos, "menor_melhor", " p.p.")}
        hint={textoCobertura(dados.emailsInvalidos.atual, COTACOES)}
        icon={MailX}
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
