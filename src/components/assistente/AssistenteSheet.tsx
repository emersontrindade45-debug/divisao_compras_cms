"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AssistenteChat } from "./AssistenteChat";

// Gatilho do assistente (M13), em painel lateral.
//
// Painel e não aba: as abas do detalhe do processo SÃO as 4 etapas do fluxo da
// IN 65/2021 (`EtapaId`, consumido por `conformidade.ts` e pelo
// `ProcessoStepper`), e enfiar uma quinta aba não-etapa ali distorceria um tipo
// do qual a conformidade depende. O painel também é melhor para o uso real: o
// servidor conversa com o assistente enquanto continua vendo a lista de
// candidatos por trás.
//
// O mesmo componente serve os dois escopos decididos com o usuário — com
// `processoId` é a conversa do processo; sem ele, o atalho global da Topbar.

export function AssistenteSheet({
  processoId = null,
  processoNumero,
  rotulo = "Assistente",
  somenteIcone = false,
}: {
  processoId?: string | null;
  processoNumero?: string;
  rotulo?: string;
  somenteIcone?: boolean;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger
        render={
          <Button variant="outline" size={somenteIcone ? "icon" : "sm"}>
            <Sparkles aria-hidden />
            {somenteIcone ? <span className="sr-only">{rotulo}</span> : rotulo}
          </Button>
        }
      />
      <SheetContent
        side="right"
        // Mais largo que o padrão (`sm:max-w-sm`): a conversa mostra rastro de
        // ferramentas e listas de candidatos, que ficam ilegíveis em coluna
        // estreita.
        className="w-full gap-0 p-4 sm:max-w-xl"
      >
        <SheetHeader className="p-0 pb-2">
          <SheetTitle>
            {processoNumero ? `Assistente — processo ${processoNumero}` : "Assistente de pesquisa"}
          </SheetTitle>
          <SheetDescription>
            Registra candidatos e redige rascunhos. Não cria fonte da estimativa nem envia e-mail.
          </SheetDescription>
        </SheetHeader>

        {/* Montado só com o painel aberto: sem isso a conversa seguiria em
            memória e o stream continuaria rodando com o painel fechado. */}
        {aberto && (
          <AssistenteChat
            processoId={processoId}
            processoNumero={processoNumero}
            className="min-h-0 flex-1"
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
