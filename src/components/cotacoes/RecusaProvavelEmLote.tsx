"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resolverRespostaEmail } from "@/lib/actions/resolverRespostaEmail";
import { processarComConcorrencia } from "@/lib/similaridade/processarComConcorrencia";

/** Respostas resolvidas ao mesmo tempo: cada uma é uma transação no banco. */
const CONCORRENCIA = 4;

/**
 * Confirma em lote as respostas cujo texto parece recusa (frase fora da lista fixa). A regra só
 * SUGERE — foi medida numa amostra pequena —, então o lote exige revisão explícita: o analista
 * abre algumas no Gmail e confirma num segundo passo. Cada resposta passa pela MESMA resolução
 * individual (atômica e auditada), sem caminho novo de escrita.
 */
export function RecusaProvavelEmLote({ ids }: { ids: string[] }) {
  const [confirmando, setConfirmando] = useState(false);
  const [feitas, setFeitas] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirmar() {
    startTransition(async () => {
      setFeitas(0);
      let falhas = 0;
      await processarComConcorrencia(
        ids,
        CONCORRENCIA,
        async (id) => {
          const r = await resolverRespostaEmail({ id, desfecho: "recusa" });
          if (r.error) falhas += 1;
          setFeitas((n) => n + 1);
        },
        () => {
          falhas += 1;
        },
      );
      setConfirmando(false);
      router.refresh();
      if (falhas > 0) {
        toast.warning(`${ids.length - falhas} confirmada(s) como recusa; ${falhas} não puderam ser resolvidas.`);
      } else {
        toast.success(`${ids.length} resposta(s) confirmadas como recusa.`);
      }
    });
  }

  return (
    <section
      aria-label="Respostas que parecem recusa"
      className="space-y-2 rounded-md border border-dashed bg-muted/30 p-3"
    >
      <p className="text-sm">
        <strong>{ids.length}</strong> {ids.length === 1 ? "resposta parece" : "respostas parecem"} recusa
        (o texto tem frase de recusa que a lista fixa não conhecia). Abra algumas no Gmail para
        conferir antes de confirmar em lote.
      </p>
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={confirmar} disabled={pending}>
            {pending ? `Confirmando… ${feitas}/${ids.length}` : `Sim, confirmar ${ids.length} como recusa`}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)} disabled={pending}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConfirmando(true)}>
          Confirmar {ids.length} como recusa…
        </Button>
      )}
    </section>
  );
}
