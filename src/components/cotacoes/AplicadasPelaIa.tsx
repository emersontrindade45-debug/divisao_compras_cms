"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { desfazerRespostaAplicadaPelaIa } from "@/lib/actions/desfazerAplicacaoIa";

export interface AplicadaPelaIaItem {
  gmailMensagemId: string;
  classe: string;
  justificativa: string;
  aplicadaEm: string;
  processoNumero: string | null;
  fornecedor: string | null;
  linkGmail: string;
}

const ROTULO: Record<string, string> = {
  orcamento: "orçamento",
  recusa: "recusa",
  duvida: "dúvida",
  nao_e_resposta: "não é resposta",
};

function Linha({ item }: { item: AplicadaPelaIaItem }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function desfazer() {
    startTransition(async () => {
      const r = await desfazerRespostaAplicadaPelaIa({ gmailMensagemId: item.gmailMensagemId });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Desfeito. A resposta voltou para 'Respostas a confirmar'.");
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
      <span className="font-medium tabular-nums">{item.processoNumero ?? "Processo não identificado"}</span>
      <span className="text-muted-foreground tabular-nums">
        {new Date(item.aplicadaEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
      </span>
      <Badge variant="secondary" className="text-xs">
        IA aplicou: {ROTULO[item.classe] ?? item.classe}
      </Badge>
      {item.fornecedor && <span className="text-xs text-muted-foreground">{item.fornecedor}</span>}
      <span className="text-muted-foreground">{item.justificativa}</span>
      <div className="ml-auto flex items-center gap-2">
        <a
          href={item.linkGmail}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Abrir no Gmail <ExternalLink className="size-3" aria-hidden />
        </a>
        <Button size="sm" variant="outline" disabled={pending} onClick={desfazer} className="gap-1">
          <Undo2 className="size-3.5" aria-hidden /> Desfazer
        </Button>
      </div>
    </li>
  );
}

/**
 * Respostas que a IA classificou SOZINHA (M30.d, Fase 3b), para o analista conferir e, se discordar,
 * desfazer. Mostra a justificativa curta e o link para abrir o e-mail NO Gmail — nunca o texto.
 */
export function AplicadasPelaIa({ itens }: { itens: AplicadaPelaIaItem[] }) {
  if (itens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma resposta foi classificada pela IA sozinha. Quando a aplicação automática estiver ligada, o que ela
        decidir aparece aqui, com o botão para desfazer.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        A IA aplicou estas classificações porque duas leituras independentes concordaram e a regra de palavras não
        contradisse. Se alguma estiver errada, desfaça: a resposta volta para a fila.
      </p>
      <ul className="space-y-2" aria-label="Respostas aplicadas pela IA">
        {itens.map((i) => (
          <Linha key={i.gmailMensagemId} item={i} />
        ))}
      </ul>
    </div>
  );
}
