"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { encerrarNaoRespostaSemFornecedor } from "@/lib/actions/encerrarNaoResposta";

/**
 * Fecha em lote as respostas sem fornecedor ligado que a IA leu, com confiança alta, como "não é
 * resposta de cotação" (M30.d). Nenhuma consulta muda: só a fila é limpa. Dois passos, como o lote
 * de recusa. Os ids são escolhidos no servidor.
 */
export function EncerrarNaoRespostaEmLote({ quantas }: { quantas: number }) {
  const [confirmando, setConfirmando] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (quantas <= 0) return null;

  function encerrar() {
    startTransition(async () => {
      const r = await encerrarNaoRespostaSemFornecedor();
      setConfirmando(false);
      if (r.error || !r.data) toast.error(r.error ?? "Não foi possível encerrar.");
      else toast.success(`${r.data.encerradas} resposta(s) encerradas como não é resposta.`);
      router.refresh();
    });
  }

  return (
    <section aria-label="Encerrar respostas que não são de cotação" className="space-y-2 rounded-md border border-dashed bg-muted/30 p-3">
      <p className="text-sm">
        <strong>{quantas}</strong> {quantas === 1 ? "resposta sem fornecedor ligado foi lida" : "respostas sem fornecedor ligado foram lidas"} pela
        IA como <strong>não é resposta de cotação</strong> (confiança alta). Nenhuma consulta será alterada: só a fila é limpa.
        Abra algumas no Gmail para conferir antes.
      </p>
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={encerrar} disabled={pending}>
            {pending ? "Encerrando…" : `Sim, encerrar ${quantas}`}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)} disabled={pending}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConfirmando(true)}>
          Encerrar {quantas} como não é resposta…
        </Button>
      )}
    </section>
  );
}
