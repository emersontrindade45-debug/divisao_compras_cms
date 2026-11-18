"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { revisarOrcamentoPorPdf } from "@/lib/actions/revisarOrcamentoPdf";

export interface OrcamentoPdfRevisarItem {
  consultaId: string;
  classeIa: "recusa" | "duvida" | "nao_e_resposta";
  justificativa: string;
  processoNumero: string | null;
  fornecedor: string | null;
  linkGmail: string;
}

const DESTINO: Record<OrcamentoPdfRevisarItem["classeIa"], string> = {
  recusa: "recusa",
  duvida: "dúvida",
  nao_e_resposta: "sem resposta",
};

function Linha({ item }: { item: OrcamentoPdfRevisarItem }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function decidir(decisao: "rebaixar" | "manter") {
    startTransition(async () => {
      const r = await revisarOrcamentoPorPdf({ consultaId: item.consultaId, decisao });
      if (r.error) toast.error(r.error);
      else toast.success(decisao === "manter" ? "Orçamento mantido." : `Consulta marcada como ${DESTINO[item.classeIa]}.`);
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
      <span className="font-medium tabular-nums">{item.processoNumero ?? "Processo não identificado"}</span>
      {item.fornecedor && <span className="text-xs text-muted-foreground">{item.fornecedor}</span>}
      <Badge variant="secondary" className="text-xs">
        IA vê: {DESTINO[item.classeIa]}
      </Badge>
      <span className="text-muted-foreground">{item.justificativa}</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <a
          href={item.linkGmail}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Abrir no Gmail <ExternalLink className="size-3" aria-hidden />
        </a>
        <Button size="sm" disabled={pending} onClick={() => decidir("rebaixar")}>
          Marcar como {DESTINO[item.classeIa]}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => decidir("manter")}>
          Manter orçamento
        </Button>
      </div>
    </li>
  );
}

/**
 * Consultas marcadas "orçamento" só por terem anexo, onde a IA leu o e-mail e discorda (M30.d). A
 * regra antiga errou em todas as divergências que o analista julgou; aqui ele decide uma a uma,
 * com o link do Gmail. Nunca mostra o texto do e-mail.
 */
export function OrcamentosPorPdfARevisar({ itens }: { itens: OrcamentoPdfRevisarItem[] }) {
  if (itens.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum orçamento por anexo com divergência da IA para revisar.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Estas consultas viraram &quot;orçamento&quot; só porque a resposta trazia PDF, mas a IA leu o e-mail e entendeu
        outra coisa. Abra no Gmail, confira e decida.
      </p>
      <ul className="space-y-2" aria-label="Orçamentos por anexo a revisar">
        {itens.map((i) => (
          <Linha key={i.consultaId} item={i} />
        ))}
      </ul>
    </div>
  );
}
