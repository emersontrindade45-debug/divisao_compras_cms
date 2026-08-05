"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adicionarCandidatoSugerido } from "@/lib/actions/assistente";
import type { CandidatoSugerido } from "@/lib/assistente/sugestoes";

// Cartões dos candidatos que a busca do assistente encontrou.
//
// O assistente não registra mais nada por conta própria: ele acha, comenta, e
// cada contratação aparece aqui com o link do PNCP para conferência e um botão
// de adicionar. Só o clique grava — decisão tomada com o usuário, que quer abrir
// o edital antes de a contratação entrar na lista do processo.
//
// O cartão manda ao servidor apenas três identificadores (mensagem, candidato,
// item). Valor, órgão e data são relidos da mensagem gravada, então nada que se
// digite aqui no navegador consegue virar preço de uma estimativa pública.

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
  const [adicionados, setAdicionados] = useState<Record<string, boolean>>({});
  const [emCurso, setEmCurso] = useState<string | null>(null);
  const [itemEscolhido, setItemEscolhido] = useState<Record<string, string>>({});
  const [tipoEscolhido, setTipoEscolhido] = useState<Record<string, "servico" | "consumo">>({});
  const [descartados, setDescartados] = useState<Set<string>>(new Set());

  const sugestoesVisiveis = sugestoes.filter((s) => !descartados.has(s.id));

  if (sugestoes.length === 0) return null;

  const descartar = (id: string) => {
    setDescartados((atual) => new Set([...atual, id]));
  };

  const idsItens = new Set(itens.map((it) => it.id));

  const adicionar = async (sugestao: CandidatoSugerido) => {
    if (!mensagemId) return;
    // Valida que itemIdSugerido ainda existe no banco (pode ter sido deletado numa
    // re-sincronização anterior à correção). Se inválido, cai para o primeiro item.
    const itemIdSugeridoValido =
      sugestao.itemIdSugerido && idsItens.has(sugestao.itemIdSugerido)
        ? sugestao.itemIdSugerido
        : null;
    const itemId =
      itemEscolhido[sugestao.id] ?? itemIdSugeridoValido ?? itens[0]?.id ?? null;
    if (!itemId) return;

    const tipoObjeto = tipoEscolhido[sugestao.id] ?? "servico";

    setEmCurso(sugestao.id);
    try {
      const resultado = await adicionarCandidatoSugerido({
        mensagemId,
        candidatoId: sugestao.id,
        itemId,
        tipoObjeto,
      });
      if (resultado.ok) {
        setAdicionados((atual) => ({ ...atual, [sugestao.id]: true }));
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

  return (
    <ul className="space-y-2">
      {sugestoesVisiveis.length === 0 && (
        <li className="text-xs text-muted-foreground italic">
          Todos os candidatos foram descartados.
        </li>
      )}
      {sugestoesVisiveis.map((sugestao) => {
        const jaAdicionado = adicionados[sugestao.id] === true;
        const itemIdSugeridoValido =
          sugestao.itemIdSugerido && idsItens.has(sugestao.itemIdSugerido)
            ? sugestao.itemIdSugerido
            : null;
        const itemId =
          itemEscolhido[sugestao.id] ?? itemIdSugeridoValido ?? itens[0]?.id ?? "";
        // Botão que não faz nada é pior que botão ausente (CLAUDE.md §9.40):
        // quando falta processo, item ou id de mensagem, ele sai desabilitado
        // com o motivo no title.
        const impedimento = !mensagemId
          ? "Aguarde o assistente terminar de responder."
          : itens.length === 0
            ? "Abra um processo com itens cadastrados para adicionar candidatos."
            : null;

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
                  onClick={() => descartar(sugestao.id)}
                  aria-label="Descartar candidato"
                  title="Descartar este candidato da lista"
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
              {sugestao.fonteUrl && (
                <a
                  href={sugestao.fonteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Abrir no PNCP
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </div>

            {jaAdicionado ? (
              <p className="inline-flex items-center gap-1 text-success-strong">
                <Check className="size-3.5" aria-hidden />
                Na lista do processo
              </p>
            ) : (
              <div className="space-y-1.5">
                {/* Seletor de tipo: controla a janela de recência aceita no servidor.
                    Serviço continuado → 2 anos (730 dias); Consumo → 1 ano (365 dias).
                    Também relaxa o limiar de score para adição manual (de 70 para 40). */}
                <div className="flex items-center gap-2">
                  <select
                    value={tipoEscolhido[sugestao.id] ?? "servico"}
                    onChange={(e) =>
                      setTipoEscolhido((atual) => ({
                        ...atual,
                        [sugestao.id]: e.target.value as "servico" | "consumo",
                      }))
                    }
                    aria-label="Tipo do objeto contratado"
                    className="rounded-md border bg-background px-1.5 py-1 text-xs"
                  >
                    <option value="servico">Serviço cont. (até 2 anos)</option>
                    <option value="consumo">Aquisição/Consumo (até 1 ano)</option>
                  </select>
                  {itens.length > 1 && (
                    <select
                      value={itemId}
                      onChange={(e) =>
                        setItemEscolhido((atual) => ({ ...atual, [sugestao.id]: e.target.value }))
                      }
                      aria-label="Item que receberá o candidato"
                      className="min-w-0 flex-1 rounded-md border bg-background px-1.5 py-1 text-xs"
                    >
                      {itens.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.descricao}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={impedimento !== null || emCurso === sugestao.id}
                  title={impedimento ?? undefined}
                  onClick={() => void adicionar(sugestao)}
                >
                  <Plus aria-hidden />
                  {emCurso === sugestao.id ? "Adicionando…" : "Adicionar à lista"}
                </Button>
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
