"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, ExternalLink, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  adicionarCandidatoSugerido,
  adicionarItemDaContratacao,
  descartarCandidatoAssistente,
  listarOutrosItensDaContratacao,
  type ItemIrmaoDaContratacao,
} from "@/lib/actions/assistente";
import { identidadeDaContratacao, type CandidatoSugerido } from "@/lib/assistente/sugestoes";
import { resolverLinkOrigem } from "@/lib/similaridade/linkOrigem";

// Cartões dos candidatos que a busca do assistente encontrou.
//
// O assistente não registra mais nada por conta própria: ele acha, comenta, e
// cada contratação aparece aqui com o link da fonte de origem (PNCP, Painel de
// Preços, SINAPI) para conferência e um botão de adicionar. Só o clique grava
// de adicionar. Só o clique grava — decisão tomada com o usuário, que quer abrir
// o edital antes de a contratação entrar na lista do processo.
//
// O cartão manda ao servidor apenas identificadores (mensagem, candidato,
// item, e — para itens-irmãos — o número do item na contratação). Valor,
// órgão e data são sempre relidos/buscados no servidor, então nada que se
// digite ou clique aqui no navegador consegue virar preço de uma estimativa
// pública.
//
// O mesmo candidato pode servir a mais de um item do processo (serviços
// parecidos em fachadas diferentes, por exemplo), e o servidor deduplica por
// `itemId + fonteUrl` — não por candidato. Por isso o cartão segue ativo depois
// de adicionar: registra em quais itens já entrou e continua oferecendo os que
// faltam, saindo do ar só quando todos receberam o candidato.
//
// O ranqueamento por relevância do PNCP mantém só os itens mais aderentes ao
// termo buscado por contratação — os demais itens da MESMA licitação (outras
// áreas, outros lotes) são descartados em silêncio mesmo quando servem a outro
// item do TR. O picker "ver outros itens desta licitação" busca esses itens
// sob demanda e oferece cada um para um item de destino diferente do processo.

const formatarMoeda = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatarData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export function SugestoesCandidatos({
  mensagemId,
  sugestoes,
  itens,
}: {
  /** Nulo enquanto o turno ainda não foi gravado: sem id não há o que aprovar. */
  mensagemId: string | null;
  sugestoes: CandidatoSugerido[];
  itens: { id: string; descricao: string }[];
}) {
  const router = useRouter();
  /** Por chave (candidato, ou `candidatoId:numeroItem` para item-irmão), os itens que já o receberam nesta sessão. */
  const [adicionados, setAdicionados] = useState<Record<string, string[]>>({});
  const [emCurso, setEmCurso] = useState<string | null>(null);
  const [itemEscolhido, setItemEscolhido] = useState<Record<string, string>>({});
  const [descartados, setDescartados] = useState<Set<string>>(new Set());

  /** Itens-irmãos já buscados por candidato — cache local, não refeito ao recolher/expandir. */
  const [itensContratacao, setItensContratacao] = useState<
    Record<string, { itens: ItemIrmaoDaContratacao[]; truncado: boolean }>
  >({});
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [carregandoContratacao, setCarregandoContratacao] = useState<string | null>(null);

  const sugestoesVisiveis = sugestoes.filter((s) => !descartados.has(s.id));

  if (sugestoes.length === 0) return null;

  const descartar = (sugestao: CandidatoSugerido) => {
    // Atualização imediata do estado local para UX instantânea.
    setDescartados((atual) => new Set([...atual, sugestao.id]));

    // Persiste o descarte no banco (fire-and-forget): buscas futuras do assistente
    // não reapresentarão contratos que o analista já descartou.
    if (mensagemId && itens.length > 0) {
      const itemIdSugeridoValido =
        sugestao.itemIdSugerido && idsItens.has(sugestao.itemIdSugerido)
          ? sugestao.itemIdSugerido
          : null;
      const itemId = itemIdSugeridoValido ?? itens[0]?.id;
      if (itemId) {
        void descartarCandidatoAssistente({
          mensagemId,
          candidatoId: sugestao.id,
          itemId,
        });
      }
    }
  };

  const idsItens = new Set(itens.map((it) => it.id));
  const descricaoDoItem = new Map(itens.map((it) => [it.id, it.descricao]));

  /**
   * Estado de destino de uma chave (candidato principal, ou item-irmão sob a
   * chave `candidatoId:numeroItem`): onde já entrou, o que ainda falta e qual
   * item o seletor mostra agora. Tudo derivado na renderização, nunca espelhado
   * em estado (CLAUDE.md §9.41) — quando um item recebe o candidato, a escolha
   * guardada deixa de ser válida e o seletor cai sozinho no próximo pendente.
   *
   * `itemIdSugerido` é validado contra os pendentes: além de poder apontar para
   * item deletado numa re-sincronização, ele fica obsoleto assim que o item que
   * o modelo sugeriu já recebeu o candidato. Itens-irmãos não têm sugestão do
   * modelo (ele nunca os viu), então chamam esta função com `null`.
   */
  const destinosDe = (chave: string, itemIdSugerido: string | null) => {
    const jaRecebidos = adicionados[chave] ?? [];
    const pendentes = itens.filter((it) => !jaRecebidos.includes(it.id));
    const escolha = itemEscolhido[chave];
    const escolhaValida =
      escolha !== undefined && pendentes.some((it) => it.id === escolha) ? escolha : null;
    const sugeridoValido =
      itemIdSugerido && pendentes.some((it) => it.id === itemIdSugerido) ? itemIdSugerido : null;
    return {
      jaRecebidos,
      pendentes,
      itemId: escolhaValida ?? sugeridoValido ?? pendentes[0]?.id ?? null,
    };
  };

  const adicionar = async (sugestao: CandidatoSugerido) => {
    if (!mensagemId) return;
    const { itemId } = destinosDe(sugestao.id, sugestao.itemIdSugerido);
    if (!itemId) return;

    setEmCurso(sugestao.id);
    try {
      const resultado = await adicionarCandidatoSugerido({
        mensagemId,
        candidatoId: sugestao.id,
        itemId,
      });
      if (resultado.ok) {
        setAdicionados((atual) => ({
          ...atual,
          [sugestao.id]: [...(atual[sugestao.id] ?? []), itemId],
        }));
        toast.success(resultado.mensagem);
        // A tabela de candidatos é renderizada no servidor: sem isto o registro
        // entra no banco e a tela ao lado continua a mesma até um F5.
        router.refresh();
      } else {
        toast.error(resultado.mensagem);
      }
    } catch {
      toast.error("Não foi possível adicionar o candidato.");
    } finally {
      setEmCurso(null);
    }
  };

  /** Alterna a exibição do picker de itens-irmãos, buscando na primeira vez. */
  const alternarOutrosItens = async (sugestao: CandidatoSugerido) => {
    if (expandidos.has(sugestao.id)) {
      setExpandidos((atual) => {
        const novo = new Set(atual);
        novo.delete(sugestao.id);
        return novo;
      });
      return;
    }
    setExpandidos((atual) => new Set([...atual, sugestao.id]));

    // Já buscado nesta sessão: não refaz a chamada ao PNCP a cada toggle.
    if (itensContratacao[sugestao.id] || !mensagemId) return;

    setCarregandoContratacao(sugestao.id);
    try {
      const resultado = await listarOutrosItensDaContratacao({
        mensagemId,
        candidatoId: sugestao.id,
      });
      if (resultado.ok) {
        setItensContratacao((atual) => ({
          ...atual,
          [sugestao.id]: { itens: resultado.itens, truncado: resultado.truncado },
        }));
      } else {
        toast.error(resultado.mensagem ?? "Não foi possível buscar os outros itens desta licitação.");
      }
    } catch {
      toast.error("Não foi possível buscar os outros itens desta licitação.");
    } finally {
      setCarregandoContratacao(null);
    }
  };

  const adicionarIrmao = async (sugestao: CandidatoSugerido, itemIrmao: ItemIrmaoDaContratacao) => {
    if (!mensagemId) return;
    const chave = `${sugestao.id}:${itemIrmao.numeroItem}`;
    const { itemId } = destinosDe(chave, null);
    if (!itemId) return;

    setEmCurso(chave);
    try {
      const resultado = await adicionarItemDaContratacao({
        mensagemId,
        candidatoId: sugestao.id,
        numeroItem: itemIrmao.numeroItem,
        itemId,
      });
      if (resultado.ok) {
        setAdicionados((atual) => ({
          ...atual,
          [chave]: [...(atual[chave] ?? []), itemId],
        }));
        toast.success(resultado.mensagem);
        router.refresh();
      } else {
        toast.error(resultado.mensagem);
      }
    } catch {
      toast.error("Não foi possível adicionar este item.");
    } finally {
      setEmCurso(null);
    }
  };

  return (
    <ul className="space-y-2">
      {sugestoesVisiveis.length === 0 && (
        <li className="text-xs text-muted-foreground italic">
          Todos os candidatos foram descartados.
        </li>
      )}
      {sugestoesVisiveis.map((sugestao) => {
        const { jaRecebidos, pendentes, itemId } = destinosDe(sugestao.id, sugestao.itemIdSugerido);
        const jaAdicionado = jaRecebidos.length > 0;
        // Só quando todos os itens do processo já receberam o candidato é que
        // não sobra ação — aí o cartão vira indicador (CLAUDE.md §9.40).
        const esgotado = jaAdicionado && pendentes.length === 0;
        // Botão que não faz nada é pior que botão ausente (CLAUDE.md §9.40):
        // quando falta processo, item ou id de mensagem, ele sai desabilitado
        // com o motivo no title.
        const impedimento = !mensagemId
          ? "Aguarde o assistente terminar de responder."
          : itens.length === 0
            ? "Abra um processo com itens cadastrados para adicionar candidatos."
            : null;

        const contratacaoExpandida = expandidos.has(sugestao.id);
        const contratacao = itensContratacao[sugestao.id];
        const origem = resolverLinkOrigem(sugestao.tipoCandidato, sugestao.fonteUrl);

        return (
          <li
            key={sugestao.id}
            className="space-y-2 rounded-lg border bg-background p-2.5 text-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-foreground">{sugestao.fonteOrgaoOuId}</p>
              {!jaAdicionado && (
                <button
                  type="button"
                  onClick={() => descartar(sugestao)}
                  aria-label="Descartar candidato"
                  title="Descartar — não voltará em buscas futuras"
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
            <p className="line-clamp-3 text-muted-foreground">{sugestao.fonteDescricao}</p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono tabular-nums text-foreground">
                {formatarMoeda(sugestao.valorUnitario)}
              </span>
              <span className="text-muted-foreground">{sugestao.unidade}</span>
              <span className="text-muted-foreground">
                {formatarData(sugestao.dataReferencia)}
              </span>
              {origem && (
                <a
                  href={origem.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {origem.rotulo}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
              {identidadeDaContratacao(sugestao) && mensagemId && (
                <button
                  type="button"
                  onClick={() => void alternarOutrosItens(sugestao)}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {contratacaoExpandida ? "Ocultar outros itens desta licitação" : "Ver outros itens desta licitação"}
                  {contratacaoExpandida ? (
                    <ChevronUp className="size-3" aria-hidden />
                  ) : (
                    <ChevronDown className="size-3" aria-hidden />
                  )}
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {jaAdicionado && (
                <p className="flex items-start gap-1 text-success-strong">
                  <Check className="mt-px size-3.5 shrink-0" aria-hidden />
                  <span>
                    Na lista de:{" "}
                    {jaRecebidos
                      .map((id) => descricaoDoItem.get(id) ?? id)
                      .join(" · ")}
                  </span>
                </p>
              )}
              {esgotado ? (
                <p className="text-muted-foreground">
                  Todos os itens do processo já receberam este candidato.
                </p>
              ) : (
                <>
                  {/* A janela de recência aceita pelo servidor vem de Item.natureza
                      (classificado na lista de fontes do processo), não de uma escolha
                      feita aqui — evita depender do analista lembrar o tipo a cada clique.

                      Os itens que já receberam o candidato saem da lista: o servidor
                      recusaria a repetição, e oferecer a opção seria prometer uma ação
                      que não acontece (CLAUDE.md §9.40). */}
                  {itens.length > 1 && (
                    <select
                      value={itemId ?? ""}
                      onChange={(e) =>
                        setItemEscolhido((atual) => ({ ...atual, [sugestao.id]: e.target.value }))
                      }
                      aria-label="Item que receberá o candidato"
                      className="min-w-0 flex-1 rounded-md border bg-background px-1.5 py-1 text-xs"
                    >
                      {pendentes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.descricao}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={impedimento !== null || emCurso === sugestao.id}
                    title={impedimento ?? undefined}
                    onClick={() => void adicionar(sugestao)}
                  >
                    <Plus aria-hidden />
                    {emCurso === sugestao.id
                      ? "Adicionando…"
                      : jaAdicionado
                        ? "Adicionar a outro item"
                        : "Adicionar à lista"}
                  </Button>
                </>
              )}
            </div>

            {contratacaoExpandida && (
              <div className="space-y-2 rounded-md border border-dashed p-2">
                {carregandoContratacao === sugestao.id && (
                  <p className="text-muted-foreground">Buscando itens da licitação…</p>
                )}
                {carregandoContratacao !== sugestao.id && contratacao?.itens.length === 0 && (
                  <p className="text-muted-foreground">
                    Nenhum outro item com preço homologado nesta licitação.
                  </p>
                )}
                {contratacao?.itens.map((itemIrmao) => (
                  <ItemIrmaoRow
                    key={itemIrmao.numeroItem}
                    sugestao={sugestao}
                    itemIrmao={itemIrmao}
                    itens={itens}
                    destinosDe={destinosDe}
                    descricaoDoItem={descricaoDoItem}
                    setItemEscolhido={setItemEscolhido}
                    emCurso={emCurso}
                    onAdicionar={adicionarIrmao}
                  />
                ))}
                {contratacao?.truncado && (
                  <p className="text-muted-foreground italic">
                    Lista truncada — esta licitação tem mais itens do que os exibidos aqui.
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
      {descartados.size > 0 && (
        <li>
          <button
            type="button"
            onClick={() => setDescartados(new Set())}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Restaurar {descartados.size} descartado{descartados.size !== 1 ? "s" : ""}
          </button>
        </li>
      )}
    </ul>
  );
}

/** Uma linha do picker de "outros itens desta licitação" — mesmo padrão do card principal, em miniatura. */
function ItemIrmaoRow({
  sugestao,
  itemIrmao,
  itens,
  destinosDe,
  descricaoDoItem,
  setItemEscolhido,
  emCurso,
  onAdicionar,
}: {
  sugestao: CandidatoSugerido;
  itemIrmao: ItemIrmaoDaContratacao;
  itens: { id: string; descricao: string }[];
  destinosDe: (
    chave: string,
    itemIdSugerido: string | null,
  ) => { jaRecebidos: string[]; pendentes: { id: string; descricao: string }[]; itemId: string | null };
  descricaoDoItem: Map<string, string>;
  setItemEscolhido: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  emCurso: string | null;
  onAdicionar: (sugestao: CandidatoSugerido, itemIrmao: ItemIrmaoDaContratacao) => void;
}) {
  const chave = `${sugestao.id}:${itemIrmao.numeroItem}`;
  const { jaRecebidos, pendentes, itemId } = destinosDe(chave, null);
  const jaAdicionado = jaRecebidos.length > 0;
  const esgotado = jaAdicionado && pendentes.length === 0;

  return (
    <div className="space-y-1 border-t pt-2 first:border-t-0 first:pt-0">
      <p className="line-clamp-2 text-muted-foreground">{itemIrmao.descricao}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono tabular-nums text-foreground">
          {formatarMoeda(itemIrmao.valorUnitario)}
        </span>
        <span className="text-muted-foreground">{itemIrmao.unidade}</span>
        <span className="text-muted-foreground">{formatarData(itemIrmao.dataReferencia)}</span>
      </div>
      {jaAdicionado && (
        <p className="flex items-start gap-1 text-success-strong">
          <Check className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>Na lista de: {jaRecebidos.map((id) => descricaoDoItem.get(id) ?? id).join(" · ")}</span>
        </p>
      )}
      {esgotado ? (
        <p className="text-muted-foreground">Todos os itens do processo já receberam este item.</p>
      ) : (
        <div className="flex items-center gap-1.5">
          {itens.length > 1 && (
            <select
              value={itemId ?? ""}
              onChange={(e) =>
                setItemEscolhido((atual) => ({ ...atual, [chave]: e.target.value }))
              }
              aria-label="Item que receberá este item da licitação"
              className="min-w-0 flex-1 rounded-md border bg-background px-1.5 py-1 text-xs"
            >
              {pendentes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.descricao}
                </option>
              ))}
            </select>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={emCurso === chave}
            onClick={() => onAdicionar(sugestao, itemIrmao)}
          >
            <Plus aria-hidden />
            {emCurso === chave ? "Adicionando…" : jaAdicionado ? "Adicionar a outro item" : "Adicionar à lista"}
          </Button>
        </div>
      )}
    </div>
  );
}
