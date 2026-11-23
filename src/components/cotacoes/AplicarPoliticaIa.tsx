"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { aplicarPoliticaIa } from "@/lib/actions/aplicarPoliticaIa";

export interface ContagemPolitica {
  recusa: number;
  duvida: number;
}

/**
 * Fecha as respostas pendentes pela política da IA (M30.d). Decidida a partir do histórico: a IA
 * concordou com a decisão anterior em 98,9% das recusas e 89% das dúvidas; orçamento e "não é
 * resposta" ficam para o analista. Nunca altera consulta já decidida.
 */
export function AplicarPoliticaIa({ contagem }: { contagem: ContagemPolitica }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const total = contagem.recusa + contagem.duvida;
  if (total <= 0) return null;

  function aplicar() {
    startTransition(async () => {
      const r = await aplicarPoliticaIa();
      if (r.error || !r.data) {
        toast.error(r.error ?? "Não foi possível aplicar.");
        return;
      }
      const { aplicadas, ignoradas, restantes, porClasse } = r.data;
      toast.success(
        `${aplicadas} aplicada(s): ${porClasse.recusa} recusa(s) e ${porClasse.duvida} dúvida(s)` +
          (ignoradas ? `. ${ignoradas} já tinham decisão e não foram alteradas` : "") +
          (restantes ? `. Restam ${restantes}: clique de novo.` : "."),
      );
      router.refresh();
    });
  }

  return (
    <section aria-label="Aplicar a política da IA" className="space-y-2 rounded-md border border-dashed bg-muted/30 p-3">
      <p className="text-sm">
        <strong>{total}</strong> {total === 1 ? "resposta pendente cabe" : "respostas pendentes cabem"} na política da IA:{" "}
        {contagem.recusa} recusa(s) e {contagem.duvida} dúvida(s). Ficam para você: orçamento, &ldquo;não é
        resposta&rdquo; e qualquer consulta que já tenha decisão. Cada aplicação pode ser desfeita abaixo.
      </p>
      <Button size="sm" onClick={aplicar} disabled={pending}>
        {pending ? "Aplicando…" : `Aplicar a política (${Math.min(total, 100)})`}
      </Button>
    </section>
  );
}
