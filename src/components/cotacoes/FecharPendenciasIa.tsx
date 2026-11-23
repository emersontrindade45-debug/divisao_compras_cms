"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fecharPendenciasIa } from "@/lib/actions/fecharPendenciasIa";

export interface ContagemFechamento {
  aplicarOrcamento: number;
  aplicarRecusa: number;
  aplicarDuvida: number;
  aplicarNaoEResposta: number;
  semFornecedor: number;
  fecharSemAlterar: number;
  dispensar: number;
  /** Consultas "a confirmar" com a fila já encerrada: a leitura da IA vai direto na consulta. */
  consultasOrfas: number;
}

export function totalDoFechamento(c: ContagemFechamento): number {
  return c.aplicarOrcamento + c.aplicarRecusa + c.aplicarDuvida + c.aplicarNaoEResposta + c.semFornecedor + c.fecharSemAlterar + c.dispensar + c.consultasOrfas;
}

/**
 * Fechamento das pendências (M30.d), por decisão do usuário: aplica TODAS as sugestões da IA nas
 * consultas ainda abertas (inclusive "orçamento" e "não é resposta"), encerra a entrada da fila das que
 * já têm decisão e dispensa as de out a dez/2025 sem leitura da IA. Nunca altera consulta já decidida.
 * Nada é apagado.
 */
export function FecharPendenciasIa({ contagem }: { contagem: ContagemFechamento }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const total = totalDoFechamento(contagem);
  if (total <= 0) return null;
  const aplicar = contagem.aplicarOrcamento + contagem.aplicarRecusa + contagem.aplicarDuvida + contagem.aplicarNaoEResposta;

  function fechar() {
    startTransition(async () => {
      const r = await fecharPendenciasIa();
      if (r.error || !r.data) {
        toast.error(r.error ?? "Não foi possível fechar as pendências.");
        return;
      }
      const d = r.data;
      toast.success(
        `${d.aplicadas} sugestão(ões) da IA aplicada(s), ${d.semFornecedor} sem fornecedor, ` +
          `${d.consultasResolvidas} consulta(s) "a confirmar" resolvida(s), ` +
          `${d.fechadasSemAlterar} entrada(s) já decidida(s) encerrada(s) e ${d.dispensadas} antiga(s) dispensada(s)` +
          (d.ignoradas ? `. ${d.ignoradas} já tinham sido decididas e não foram alteradas` : "") +
          (d.iaDesligada ? ". A aplicação da IA está desligada: só o encerramento foi feito" : "") +
          ".",
      );
      router.refresh();
    });
  }

  return (
    <section aria-label="Fechar as pendências" className="space-y-2 rounded-md border border-dashed bg-muted/30 p-3">
      <p className="text-sm">
        <strong>{total}</strong> {total === 1 ? "pendência pode" : "pendências podem"} ser fechadas de uma vez:
      </p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">
        <li>
          <strong>{aplicar}</strong> sugestão(ões) da IA a aplicar em consulta ainda aberta ({contagem.aplicarRecusa} recusa,{" "}
          {contagem.aplicarDuvida} dúvida, {contagem.aplicarOrcamento} orçamento, {contagem.aplicarNaoEResposta} &ldquo;não é resposta&rdquo;)
        </li>
        <li>
          <strong>{contagem.semFornecedor}</strong> sem fornecedor ligado, contadas na categoria que a IA leu
        </li>
        <li>
          <strong>{contagem.fecharSemAlterar}</strong> cuja consulta já tem decisão: só a entrada da fila é encerrada
        </li>
        <li>
          <strong>{contagem.consultasOrfas}</strong> consulta(s) &ldquo;a confirmar&rdquo; cuja fila já foi encerrada: a leitura da IA
          é aplicada direto na consulta
        </li>
        <li>
          <strong>{contagem.dispensar}</strong> de out a dez/2025 que a IA nunca leu: dispensadas da fila
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">
        Nunca altera uma consulta que já tem decisão. Nada é apagado. As aplicações da IA podem ser desfeitas na lista
        abaixo; o histórico de tudo fica na auditoria.
      </p>
      <Button size="sm" onClick={fechar} disabled={pending}>
        {pending ? "Fechando…" : `Fechar todas as pendências (${total})`}
      </Button>
    </section>
  );
}
