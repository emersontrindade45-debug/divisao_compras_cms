"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { classificarSemFornecedorPelaIa } from "@/lib/actions/classificarSemFornecedor";

export interface ContagemSemFornecedor {
  orcamento: number;
  recusa: number;
  duvida: number;
}

/**
 * Coloca cada resposta sem fornecedor ligado na categoria que a IA leu, com confiança alta (M30.d).
 * Elas passam a contar no dashboard; nenhuma consulta muda. Dois passos; os ids vêm do servidor.
 */
export function ClassificarSemFornecedorEmLote({ contagem }: { contagem: ContagemSemFornecedor }) {
  const [confirmando, setConfirmando] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const total = contagem.orcamento + contagem.recusa + contagem.duvida;
  if (total <= 0) return null;

  function aplicar() {
    startTransition(async () => {
      const r = await classificarSemFornecedorPelaIa();
      setConfirmando(false);
      if (r.error || !r.data) toast.error(r.error ?? "Não foi possível classificar.");
      else if (r.data.blocosComFalha > 0)
        toast.warning(
          `${r.data.classificadas} classificada(s); parte falhou e continua na fila. Clique de novo para as que faltam.`,
        );
      else toast.success(`${r.data.classificadas} resposta(s) classificadas e contadas no dashboard.`);
      router.refresh();
    });
  }

  return (
    <section aria-label="Classificar respostas sem fornecedor ligado" className="space-y-2 rounded-md border border-dashed bg-muted/30 p-3">
      <p className="text-sm">
        A IA leu, com confiança alta, <strong>{total}</strong> respostas que não foram ligadas a um fornecedor:{" "}
        <strong>{contagem.orcamento}</strong> orçamento(s), <strong>{contagem.recusa}</strong> recusa(s) e{" "}
        <strong>{contagem.duvida}</strong> dúvida(s). Cada uma entra na sua categoria e passa a contar no dashboard;
        nenhuma consulta é alterada. Cada uma pode ser desfeita na aba &quot;Aplicadas pela IA&quot;.
      </p>
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={aplicar} disabled={pending}>
            {pending ? "Classificando…" : `Sim, classificar ${total}`}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)} disabled={pending}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConfirmando(true)}>
          Classificar {total} pela IA…
        </Button>
      )}
    </section>
  );
}
