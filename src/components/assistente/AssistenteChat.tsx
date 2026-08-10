"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ExternalLink, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { lerStreamSSE } from "@/lib/assistente/sse";
import { obterConversaAtiva, listarItensDoProcesso } from "@/lib/actions/assistente";
import type { CandidatoSugerido } from "@/lib/assistente/sugestoes";
import { PassoFerramenta, type PassoExibido } from "./PassoFerramenta";
import { RespostaFormatada } from "./RespostaFormatada";
import { SugestoesCandidatos } from "./SugestoesCandidatos";

// Chat do assistente de pesquisa (M13).
//
// Único componente de conversa: o mesmo é usado na aba do processo e no atalho
// global da Topbar; muda só o `processoId`. O usuário nunca escolhe o motor de
// busca — PNCP, web da OpenAI e Perplexity são ferramentas que o assistente
// aciona conforme o caso.

interface Citacao {
  url: string;
  titulo: string;
}

interface Mensagem {
  id: string;
  papel: "user" | "assistant";
  conteudo: string;
  passos: PassoExibido[];
  citacoes: Citacao[];
  /** Contratações achadas neste turno, à espera de aprovação por clique. */
  sugestoes: CandidatoSugerido[];
  /** Id da mensagem no banco — chave da aprovação. Chega no evento `fim`. */
  mensagemId?: string | null;
  /** Turno terminou por teto de passos; a UI oferece continuar. */
  orcamentoEsgotado?: boolean;
  erro?: string;
}

/** Mensagem enviada pelo botão "Continuar procurando". */
const CONTINUAR =
  "Continue procurando: tente outros termos, diferentes dos que você já usou neste processo.";

export function AssistenteChat({
  processoId = null,
  processoNumero,
  className,
  itensKey = 0,
  /**
   * Retomar do banco a última conversa deste escopo. Desligado por "Nova
   * conversa", que remonta o componente para começar do zero.
   */
  retomarConversa = true,
}: {
  processoId?: string | null;
  processoNumero?: string;
  className?: string;
  /** Incrementar força o recarregamento dos itens (ex.: após sync da planilha). */
  itensKey?: number;
  retomarConversa?: boolean;
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [rascunho, setRascunho] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(retomarConversa);
  const [itens, setItens] = useState<{ id: string; descricao: string }[]>([]);
  const conversaId = useRef<string | null>(null);
  const fimDaLista = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // A conversa sempre foi gravada no banco; o que faltava era ler de volta.
  // Sem isto, fechar o painel (ou recarregar a página) perdia o histórico E
  // criava uma conversa nova a cada abertura, porque o `conversaId` voltava a
  // ser nulo.
  useEffect(() => {
    if (!retomarConversa) return;
    let cancelado = false;

    void obterConversaAtiva(processoId)
      .then((conversa) => {
        if (cancelado || !conversa) return;
        conversaId.current = conversa.conversaId;
        setMensagens(
          conversa.mensagens.map((m) => ({
            id: m.id,
            papel: m.papel,
            conteudo: m.conteudo,
            passos: m.passos.map((p) => ({ ...p, emAndamento: false })),
            citacoes: m.citacoes,
            // Reabrir a conversa devolve os cartões: uma busca de ontem continua
            // aprovável hoje, porque as sugestões ficaram gravadas na mensagem.
            sugestoes: m.passos.flatMap((p) => p.sugestoes ?? []),
            mensagemId: m.id,
          })),
        );
      })
      .catch(() => {
        // Falhar ao retomar não pode impedir uma conversa nova: o chat abre
        // vazio e segue utilizável.
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [processoId, retomarConversa]);

  // Itens do processo: é o destino de cada candidato aprovado. Fora de um
  // processo a lista fica vazia e o cartão desabilita o botão com o motivo.
  // `itensKey` é incrementado pelo AssistenteProvider após a sync da planilha,
  // forçando o recarregamento sem precisar de F5.
  useEffect(() => {
    if (!processoId) {
      setItens([]);
      return;
    }
    let cancelado = false;
    void listarItensDoProcesso(processoId)
      .then((lista) => {
        if (!cancelado) setItens(lista);
      })
      .catch(() => {
        // Sem a lista o cartão apenas não deixa adicionar; a conversa segue.
      });
    return () => {
      cancelado = true;
    };
  }, [processoId, itensKey]);

  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ block: "end" });
  }, [mensagens]);

  // Cancela o stream em curso se o componente sair da tela (fechar o Sheet,
  // trocar de aba). Sem isso o `setState` continuaria sendo chamado depois da
  // desmontagem, e o turno seguiria consumindo tokens sem ninguém lendo.
  useEffect(() => () => abortRef.current?.abort(), []);

  const enviar = useCallback(
    async (texto: string) => {
      const pergunta = texto.trim();
      if (!pergunta || enviando) return;

      setRascunho("");
      setEnviando(true);

      const idResposta = `a-${Date.now()}`;
      setMensagens((atual) => [
        ...atual,
        {
          id: `u-${Date.now()}`,
          papel: "user",
          conteudo: pergunta,
          passos: [],
          citacoes: [],
          sugestoes: [],
        },
        {
          id: idResposta,
          papel: "assistant",
          conteudo: "",
          passos: [],
          citacoes: [],
          sugestoes: [],
        },
      ]);

      /** Atualiza só a mensagem em construção, preservando o resto do histórico. */
      const atualizar = (mudanca: (m: Mensagem) => Mensagem) => {
        setMensagens((atual) => atual.map((m) => (m.id === idResposta ? mudanca(m) : m)));
      };

      const controller = new AbortController();
      abortRef.current = controller;

      // `fim` e `erro` são os dois únicos finais legítimos do stream, e ambos
      // apagam o giro dos passos. Quando a função serverless é morta por
      // `maxDuration`, o corpo da resposta fecha sem nenhum dos dois: o
      // `lerStreamSSE` resolve normalmente (fim de stream é indistinguível de
      // fim de conteúdo), o `catch` abaixo não roda, e sem esta flag o último
      // passo girava para sempre. Ver CLAUDE.md §9.64.
      let concluido = false;

      try {
        const res = await fetch("/api/assistente/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mensagem: pergunta,
            conversaId: conversaId.current,
            processoId,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          // 401/400 vêm como JSON, não como stream.
          const detalhe = (await res.json().catch(() => null)) as { error?: string } | null;
          atualizar((m) => ({
            ...m,
            erro: detalhe?.error ?? `A requisição falhou (HTTP ${res.status}).`,
          }));
          return;
        }

        await lerStreamSSE(res.body, ({ nome, dados }) => {
          if (nome === "conversa") {
            conversaId.current = String(dados.conversaId ?? "") || null;
            return;
          }
          if (nome === "passo_inicio") {
            atualizar((m) => ({
              ...m,
              passos: [
                ...m.passos,
                {
                  ferramenta: String(dados.ferramenta ?? ""),
                  argumentos: String(dados.argumentos ?? "{}"),
                  emAndamento: true,
                },
              ],
            }));
            return;
          }
          if (nome === "passo_fim") {
            atualizar((m) => {
              const passos = [...m.passos];
              // Fecha o último passo ainda aberto da mesma ferramenta: o modelo
              // pode pedir a mesma ferramenta duas vezes no mesmo turno.
              for (let i = passos.length - 1; i >= 0; i--) {
                if (passos[i]!.emAndamento && passos[i]!.ferramenta === dados.ferramenta) {
                  passos[i] = {
                    ...passos[i]!,
                    emAndamento: false,
                    resumo: typeof dados.resumo === "string" ? dados.resumo : undefined,
                    duracaoMs: typeof dados.duracaoMs === "number" ? dados.duracaoMs : undefined,
                    erro: typeof dados.erro === "string" ? dados.erro : null,
                  };
                  break;
                }
              }
              // As sugestões chegam no passo da busca. Acumular (em vez de
              // substituir) porque o modelo pode buscar várias vezes no mesmo
              // turno, e cada busca traz candidatos aprováveis.
              const novas = Array.isArray(dados.sugestoes)
                ? (dados.sugestoes as CandidatoSugerido[])
                : [];
              return {
                ...m,
                passos,
                sugestoes: novas.length > 0 ? [...m.sugestoes, ...novas] : m.sugestoes,
              };
            });
            return;
          }
          if (nome === "texto") {
            atualizar((m) => ({ ...m, conteudo: String(dados.texto ?? "") }));
            return;
          }
          if (nome === "fim") {
            concluido = true;
            atualizar((m) => ({
              ...m,
              conteudo: String(dados.texto ?? m.conteudo),
              citacoes: Array.isArray(dados.citacoes) ? (dados.citacoes as Citacao[]) : [],
              orcamentoEsgotado: dados.orcamentoEsgotado === true,
              // Só agora existe id no banco: é ele que autoriza a aprovação dos
              // cartões, então os botões ficam desabilitados até chegar aqui.
              mensagemId: typeof dados.mensagemId === "string" ? dados.mensagemId : null,
              // Passo que ficou aberto por queda no meio não pode girar para sempre.
              passos: m.passos.map((p) => ({ ...p, emAndamento: false })),
            }));
            return;
          }
          if (nome === "erro") {
            concluido = true;
            atualizar((m) => ({
              ...m,
              erro: String(dados.mensagem ?? "Falha ao processar a mensagem."),
              passos: m.passos.map((p) => ({ ...p, emAndamento: false })),
            }));
          }
        });

        if (!concluido) {
          // O turno foi cortado no meio (quase sempre o teto de tempo da função
          // na Vercel). O que já apareceu na tela continua legível, mas nada
          // disso ficou gravado: a mensagem do assistente só é criada no fim do
          // turno, e é dela que sai o `mensagemId` que autoriza aprovar os
          // candidatos. Por isso o texto manda repetir, em vez de sugerir que a
          // busca "quase" deu certo.
          atualizar((m) => ({
            ...m,
            erro:
              "A pesquisa foi interrompida antes de terminar e não ficou gravada. " +
              "Tente de novo com um termo mais curto e específico — termos longos " +
              "multiplicam as consultas ao PNCP e estouram o tempo da requisição.",
            passos: m.passos.map((p) => ({ ...p, emAndamento: false })),
          }));
        }
      } catch (erro) {
        if (erro instanceof DOMException && erro.name === "AbortError") return;
        atualizar((m) => ({
          ...m,
          erro: erro instanceof Error ? erro.message : "Falha de rede.",
          passos: m.passos.map((p) => ({ ...p, emAndamento: false })),
        }));
      } finally {
        abortRef.current = null;
        setEnviando(false);
      }
    },
    [enviando, processoId],
  );

  const vazio = !carregando && mensagens.length === 0;

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-2">
        {carregando && (
          <p className="px-1 py-2 text-sm text-muted-foreground">Retomando a conversa…</p>
        )}

        {vazio && (
          <div className="space-y-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Sparkles className="size-4" aria-hidden />
              Assistente de pesquisa
            </p>
            <p>
              {processoNumero
                ? `Pergunte sobre o processo ${processoNumero}. `
                : "Pergunte sobre qualquer processo. "}
              Ele lê o que já foi pesquisado, busca contratações no PNCP quantas vezes for
              preciso e registra o que achar como <strong>candidato</strong>.
            </p>
            <p>
              Promover candidato a fonte da estimativa continua sendo decisão sua, por clique na
              aba de similaridade.
            </p>
          </div>
        )}

        {mensagens.map((mensagem) =>
          mensagem.papel === "user" ? (
            <div key={mensagem.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-lg bg-secondary px-3 py-2 text-sm whitespace-pre-wrap">
                {mensagem.conteudo}
              </p>
            </div>
          ) : (
            <div key={mensagem.id} className="space-y-2">
              {mensagem.passos.length > 0 && (
                <ul className="rounded-lg border bg-muted/40 px-3 py-1.5">
                  {mensagem.passos.map((passo, indice) => (
                    <PassoFerramenta key={`${passo.ferramenta}-${indice}`} passo={passo} />
                  ))}
                </ul>
              )}

              {/* O modelo responde em Markdown — o próprio prompt de sistema é
                  escrito assim — e antes disso os asteriscos apareciam crus na
                  tela. A mensagem do usuário segue como texto puro: ele digita
                  texto, não marcação. */}
              {mensagem.conteudo && <RespostaFormatada conteudo={mensagem.conteudo} />}

              {/* O assistente não grava nada sozinho: cada contratação achada
                  vira um cartão com link para conferência e botão de adicionar.
                  Quem registra é o clique do servidor. */}
              <SugestoesCandidatos
                mensagemId={mensagem.mensagemId ?? null}
                sugestoes={mensagem.sugestoes}
                itens={itens}
              />

              {mensagem.citacoes.length > 0 && (
                <ul className="space-y-1 text-xs">
                  {mensagem.citacoes.map((citacao) => (
                    <li key={citacao.url}>
                      <a
                        href={citacao.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                      >
                        <ExternalLink className="size-3" aria-hidden />
                        {citacao.titulo}
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              {mensagem.erro && (
                <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-danger-strong">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {mensagem.erro}
                </p>
              )}

              {/* Teto de passos atingido: o turno acabou por orçamento, não por
                  falta de caminho. Sem este botão o usuário não saberia disso
                  (CLAUDE.md §9.40). */}
              {mensagem.orcamentoEsgotado && !enviando && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void enviar(CONTINUAR)}
                  className="mt-1"
                >
                  Continuar procurando
                </Button>
              )}
            </div>
          ),
        )}
        <div ref={fimDaLista} />
      </div>

      <form
        className="flex items-end gap-2 border-t pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(rascunho);
        }}
      >
        <Textarea
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onKeyDown={(e) => {
            // Enter envia, Shift+Enter quebra linha — convenção de chat.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar(rascunho);
            }
          }}
          disabled={enviando}
          rows={2}
          placeholder={
            processoNumero
              ? "Ex.: os candidatos do item 2 ficaram fracos, procure outros"
              : "Ex.: quais processos estão sem fonte pública?"
          }
          aria-label="Mensagem para o assistente"
        />
        <Button type="submit" size="icon" disabled={enviando || !rascunho.trim()}>
          <Send aria-hidden />
          <span className="sr-only">Enviar</span>
        </Button>
      </form>
    </div>
  );
}
