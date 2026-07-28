"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelRightClose, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AssistenteChat } from "./AssistenteChat";

// Painel do assistente como COLUNA fixa, montada no layout da área autenticada.
//
// Antes era um `Sheet` (Dialog do Base UI) montado dentro da página: modal por
// padrão, com backdrop borrado por cima do conteúdo. Três consequências que o
// uso real expôs:
//
//   1. o resto da plataforma ficava embaçado e inerte enquanto se conversava;
//   2. o chat só era montado com o painel aberto, então fechar zerava o estado;
//   3. morando na página, ele desmontava a cada navegação.
//
// Como coluna do layout, o conteúdo encolhe em vez de ser coberto, a tabela de
// candidatos fica visível ao lado da conversa, e o componente sobrevive à
// navegação entre páginas. O histórico vem do banco (ver `obterConversaAtiva`),
// então também sobrevive a recarregar a página.

interface AssistenteContexto {
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
  alternar: () => void;
}

const Contexto = createContext<AssistenteContexto | null>(null);

/**
 * Gatilhos (barra superior, botão do processo) usam este hook para abrir o
 * painel. Fora do provider devolve `null` — quem consome decide se some.
 */
export function useAssistente(): AssistenteContexto | null {
  return useContext(Contexto);
}

/** Extrai o processo da URL. O painel segue a navegação em vez de receber prop. */
function processoDaRota(pathname: string): string | null {
  const casou = /^\/processos\/([^/]+)/.exec(pathname);
  const id = casou?.[1];
  // `/processos/novo` é formulário de cadastro, não um processo existente.
  return !id || id === "novo" ? null : id;
}

export function AssistenteProvider({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();
  const processoId = processoDaRota(pathname);

  const contexto = useMemo<AssistenteContexto>(
    () => ({
      aberto,
      abrir: () => setAberto(true),
      fechar: () => setAberto(false),
      alternar: () => setAberto((atual) => !atual),
    }),
    [aberto],
  );

  return (
    <Contexto.Provider value={contexto}>
      {/* `min-w-0` no filho de flex é o que permite o conteúdo realmente
          encolher; sem isso ele mantém a largura intrínseca e o painel empurra
          a página para fora da tela, criando rolagem horizontal. */}
      <div className="flex min-w-0 flex-1">{children}</div>
      {aberto && (
        <PainelAssistente
          // A `key` por escopo zera o contador de "Nova conversa" ao mudar de
          // processo. Sem ela, quem pedisse conversa nova e depois navegasse
          // para outro processo ficaria sem retomar a conversa de lá — o painel
          // seguiria em modo "começar do zero" para sempre.
          key={processoId ?? "global"}
          processoId={processoId}
          aoFechar={contexto.fechar}
        />
      )}
    </Contexto.Provider>
  );
}

function PainelAssistente({
  processoId,
  aoFechar,
}: {
  processoId: string | null;
  aoFechar: () => void;
}) {
  const [reinicios, setReinicios] = useState(0);

  // Trocar a `key` desmonta e remonta o chat com estado limpo. É o que faz
  // "Nova conversa" começar do zero e o que troca de conversa ao navegar para
  // outro processo, sem precisar de um efeito que espelhe props em estado
  // (CLAUDE.md §9.41).
  const chave = `${processoId ?? "global"}-${reinicios}`;

  const novaConversa = useCallback(() => setReinicios((n) => n + 1), []);

  return (
    <aside
      className={cn(
        "flex flex-col border-l bg-card",
        // Em tela estreita não há espaço para uma coluna de 26rem ao lado do
        // conteúdo: vira sobreposição de tela cheia. Esconder o painel seria
        // pior — deixaria o botão sem efeito nenhum (CLAUDE.md §9.40).
        "fixed inset-0 z-40 w-full",
        // A partir de `lg` volta a ser coluna de verdade: o conteúdo encolhe ao
        // lado em vez de ficar coberto, e `sticky` mantém a conversa à vista
        // enquanto a página rola.
        "lg:sticky lg:top-0 lg:z-auto lg:h-svh lg:w-[26rem] lg:shrink-0",
      )}
      aria-label="Assistente de pesquisa"
    >
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">Assistente de pesquisa</p>
          <p className="truncate text-xs text-muted-foreground">
            {processoId ? "Conversa deste processo" : "Conversa geral"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={novaConversa}>
          Nova conversa
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={aoFechar}>
          <PanelRightClose aria-hidden />
          <span className="sr-only">Fechar assistente</span>
        </Button>
      </header>

      <div className="min-h-0 flex-1 px-4 pb-4">
        <AssistenteChat
          key={chave}
          processoId={processoId}
          // Só a primeira montagem de um escopo retoma do banco. Depois de
          // "Nova conversa", retomar traria de volta exatamente a conversa que
          // o usuário acabou de pedir para deixar de lado.
          retomarConversa={reinicios === 0}
          className="h-full"
        />
      </div>
    </aside>
  );
}

/** Botão que abre/fecha o painel. Usado na barra superior e no detalhe do processo. */
export function AssistenteToggle({
  rotulo = "Assistente",
  somenteIcone = false,
}: {
  rotulo?: string;
  somenteIcone?: boolean;
}) {
  const assistente = useAssistente();
  if (!assistente) return null;

  return (
    <Button
      variant="outline"
      size={somenteIcone ? "icon" : "sm"}
      onClick={assistente.alternar}
      aria-pressed={assistente.aberto}
    >
      <Sparkles aria-hidden />
      {somenteIcone ? <span className="sr-only">{rotulo}</span> : rotulo}
    </Button>
  );
}
