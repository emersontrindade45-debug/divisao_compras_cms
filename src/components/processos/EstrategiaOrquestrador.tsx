import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Globe, Users } from "lucide-react";

interface EstrategiaOrquestradorProps {
  classificacao: "comum" | "especifico";
  objeto: string;
}

interface EtapaEstrategia {
  numero: number;
  titulo: string;
  descricao: string;
  icon: React.ComponentType<{ className?: string }>;
  prioritaria?: boolean;
}

function getEtapas(classificacao: "comum" | "especifico"): EtapaEstrategia[] {
  if (classificacao === "comum") {
    return [
      {
        numero: 1,
        titulo: "Contratações públicas similares",
        descricao:
          "Consulte o Painel de Preços e o Comprasnet para identificar contratos com objeto idêntico ou similar celebrados nos últimos 12 meses.",
        icon: Building2,
        prioritaria: true,
      },
      {
        numero: 2,
        titulo: "Sites eletrônicos admissíveis",
        descricao:
          "Pesquise em sites da lista branca (portais governamentais). Registre URL, data e hora de acesso e salve evidência da consulta.",
        icon: Globe,
      },
      {
        numero: 3,
        titulo: "Fornecedores diretos",
        descricao:
          "Consulte ao menos 3 fornecedores cadastrados. Registre todos os contatos realizados, incluindo os que não responderam.",
        icon: Users,
      },
    ];
  }

  return [
    {
      numero: 1,
      titulo: "Contratações públicas similares",
      descricao:
        "Consulte o Painel de Preços e o Comprasnet para identificar contratos com objeto idêntico ou similar celebrados nos últimos 12 meses.",
      icon: Building2,
      prioritaria: true,
    },
    {
      numero: 2,
      titulo: "Fornecedores diretos",
      descricao:
        "Para itens específicos, priorize a consulta direta a fornecedores qualificados. Consulte ao menos 3 e registre todos os contatos.",
      icon: Users,
    },
    {
      numero: 3,
      titulo: "Sites eletrônicos admissíveis",
      descricao:
        "Use sites como complemento. Para itens específicos, sites tendem a ter menor aderência — justifique a utilização quando necessário.",
      icon: Globe,
    },
  ];
}

export function EstrategiaOrquestrador({ classificacao, objeto }: EstrategiaOrquestradorProps) {
  const etapas = getEtapas(classificacao);
  const labelClassificacao = classificacao === "comum" ? "Item comum" : "Item específico";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Ordem de busca recomendada</CardTitle>
          <span className="text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-full px-2 py-0.5">
            {labelClassificacao}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{objeto}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {etapas.map((etapa) => {
          const Icon = etapa.icon;
          return (
            <div key={etapa.numero} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {etapa.numero}
                </div>
                {etapa.numero < etapas.length && (
                  <div className="mt-1 w-px grow bg-border" />
                )}
              </div>
              <div className="pb-4 space-y-1">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{etapa.titulo}</span>
                  {etapa.prioritaria && (
                    <span className="text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-full px-2 py-0.5">
                      Prioritária IN 65/2021
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{etapa.descricao}</p>
              </div>
            </div>
          );
        })}

        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          {classificacao === "comum"
            ? "Justifique por escrito quando não for possível utilizar contratações públicas como fonte primária."
            : "Para item específico, a ausência de contratações similares deve ser registrada antes de avançar para outras fontes."}
        </div>
      </CardContent>
    </Card>
  );
}
