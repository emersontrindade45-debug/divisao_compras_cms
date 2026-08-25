"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EstrategiaOrquestrador } from "./EstrategiaOrquestrador";
import { ProcessoStepper } from "./ProcessoStepper";
import { EtapaPesquisa } from "./EtapaPesquisa";
import { EtapaValidacao, type CotacaoResumo } from "./EtapaValidacao";
import { EtapaConsolidacao } from "./EtapaConsolidacao";
import type { ConformidadeProcesso, EtapaId } from "@/lib/domain/conformidade";
import type { ProcessoFixture } from "@/lib/fixtures/processos";
import type { SeriePrecoFixture } from "@/lib/fixtures/seriePrecos";

export type { FonteResumo } from "./EtapaPesquisa";
export type { CotacaoResumo } from "./EtapaValidacao";

import type { FonteResumo } from "./EtapaPesquisa";

const ETAPAS_VALIDAS: readonly EtapaId[] = [
  "estrategia",
  "pesquisa",
  "validacao",
  "consolidacao",
];

function parseEtapa(valor: string | null): EtapaId | undefined {
  return ETAPAS_VALIDAS.find((e) => e === valor);
}

/**
 * Detalhe do processo organizado como as 4 etapas do fluxo da IN 65/2021.
 *
 * A etapa inicial vem de `?etapa=` (deep-link usado pelo painel de conformidade
 * e pela fila do dashboard) ou, na ausência dela, da etapa que a conformidade
 * indica como a atual — o servidor cai direto onde há trabalho a fazer.
 */
export function ProcessoTabs({
  processo,
  conformidade,
  fontes = [],
  cotacoes = [],
  serie,
  podeConsolidar = false,
  fontesSimilaridade,
  itens = [],
}: {
  processo: ProcessoFixture;
  conformidade: ConformidadeProcesso;
  fontes?: FonteResumo[];
  cotacoes?: CotacaoResumo[];
  serie?: SeriePrecoFixture;
  podeConsolidar?: boolean;
  fontesSimilaridade?: ReactNode;
  itens?: { id: string; descricao: string }[];
}) {
  const searchParams = useSearchParams();
  const etapaDaUrl = parseEtapa(searchParams.get("etapa"));

  // A aba ativa vem da URL quando há `?etapa=` (deep-link do painel de
  // conformidade e da fila do dashboard) e, na falta dela, da etapa que a
  // conformidade aponta como atual. `escolha` cobre a troca manual de aba, que
  // usa history.replaceState e por isso não re-renderiza via App Router.
  //
  // `origem` guarda o valor da URL no momento do clique: quando a URL muda
  // depois disso (novo deep-link), ela volta a mandar — sem isso, um clique
  // manual congelaria a aba para o resto da sessão.
  const [escolha, setEscolha] = useState<{ etapa: EtapaId; origem?: EtapaId }>();
  const ativa =
    escolha && escolha.origem === etapaDaUrl
      ? escolha.etapa
      : (etapaDaUrl ?? conformidade.etapaAtual);

  function handleChange(valor: EtapaId) {
    setEscolha({ etapa: valor, origem: etapaDaUrl });
    // Mantém a URL compartilhável sem disparar navegação do App Router.
    const url = new URL(window.location.href);
    url.searchParams.set("etapa", valor);
    window.history.replaceState(null, "", url);
  }

  const progresso = {
    contratacoes: fontes.filter(
      (f) => f.tipo === "contratacao_publica" && f.status === "incluido",
    ).length,
    sites: fontes.filter((f) => f.tipo === "site_eletronico" && f.status === "incluido")
      .length,
    fornecedores: cotacoes.length,
  };

  return (
    <Tabs
      value={ativa}
      onValueChange={(valor) => handleChange(valor as EtapaId)}
      className="space-y-4"
    >
      <ProcessoStepper etapas={conformidade.etapas} />

      <TabsContent value="estrategia" className="space-y-4">
        <EstrategiaOrquestrador
          classificacao={processo.classificacao}
          objeto={processo.objeto}
          progresso={progresso}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informações técnicas do objeto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">Características técnicas</p>
              <p className="text-muted-foreground">{processo.caracteristicasTecnicas}</p>
            </div>
            <div>
              <p className="font-medium">Palavras-chave</p>
              <p className="text-muted-foreground">{processo.palavrasChave.join(", ")}</p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="pesquisa">
        <EtapaPesquisa
          processoId={processo.id}
          fontes={fontes}
          fontesSimilaridade={fontesSimilaridade}
          itens={itens}
        />
      </TabsContent>

      <TabsContent value="validacao">
        <EtapaValidacao cotacoes={cotacoes} />
      </TabsContent>

      <TabsContent value="consolidacao">
        <EtapaConsolidacao
          processoId={processo.id}
          serie={serie}
          podeConsolidar={podeConsolidar}
        />
      </TabsContent>
    </Tabs>
  );
}
