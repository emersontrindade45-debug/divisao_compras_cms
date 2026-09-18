"use client";

import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { listarConversas, type ConversaNaLista } from "@/lib/actions/assistente";
import { cn } from "@/lib/utils";

// Lista das conversas anteriores do escopo (processo ou geral).
//
// Existe porque o painel só alcançava a ÚLTIMA conversa: cada "Nova conversa"
// empurrava a anterior para fora da tela, ainda gravada no banco e sem nenhum
// caminho de volta. O custo não era só o texto — os cartões de candidato vivem
// na mensagem do assistente, e com eles some o picker de "outros itens desta
// licitação", que é a única forma de aproveitar o resto de uma ata já
// encontrada.

/**
 * Data relativa curta, no padrão que o analista lê de relance na lista. Datas
 * do mesmo dia mostram a hora; o resto mostra o dia.
 */
function quando(iso: string): string {
  const data = new Date(iso);
  const agora = new Date();
  const mesmoDia =
    data.getFullYear() === agora.getFullYear() &&
    data.getMonth() === agora.getMonth() &&
    data.getDate() === agora.getDate();

  return mesmoDia
    ? data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function HistoricoConversas({
  processoId,
  conversaAtual,
  aoEscolher,
}: {
  processoId: string | null;
  /** Conversa aberta agora — destacada na lista, para o analista se situar. */
  conversaAtual: string | null;
  aoEscolher: (conversaId: string) => void;
}) {
  const [conversas, setConversas] = useState<ConversaNaLista[] | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelado = false;
    void listarConversas(processoId)
      .then((lista) => {
        if (!cancelado) setConversas(lista);
      })
      .catch(() => {
        if (!cancelado) setErro(true);
      });
    return () => {
      cancelado = true;
    };
  }, [processoId]);

  if (erro) {
    return (
      <p className="px-1 py-6 text-center text-xs text-muted-foreground">
        Não foi possível carregar as conversas anteriores.
      </p>
    );
  }

  if (conversas === null) {
    return <p className="px-1 py-6 text-center text-xs text-muted-foreground">Carregando…</p>;
  }

  if (conversas.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs text-muted-foreground">
        Nenhuma conversa anterior {processoId ? "neste processo" : "fora de um processo"}.
      </p>
    );
  }

  return (
    <ul className="space-y-1 py-2" aria-label="Conversas anteriores">
      {conversas.map((conversa) => {
        const atual = conversa.id === conversaAtual;
        return (
          <li key={conversa.id}>
            <button
              type="button"
              onClick={() => aoEscolher(conversa.id)}
              aria-current={atual ? "true" : undefined}
              className={cn(
                "w-full rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                atual
                  ? "border-primary/40 bg-muted"
                  : "border-transparent hover:border-border hover:bg-muted",
              )}
            >
              <span className="line-clamp-2 font-medium text-foreground">{conversa.titulo}</span>
              <span className="mt-1 flex items-center gap-2 text-muted-foreground">
                <span className="tabular-nums">{quando(conversa.ultimaMensagemEm)}</span>
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="size-3" aria-hidden />
                  <span className="tabular-nums">{conversa.totalMensagens}</span>
                </span>
                {atual && <span className="text-primary">aberta</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
