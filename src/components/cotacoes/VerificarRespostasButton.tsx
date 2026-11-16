"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MailSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { verificarRespostasEmail } from "@/lib/actions/verificarRespostasEmail";
import { resumirVerificacao } from "@/lib/domain/cotacaoEmail/resumo";

/**
 * Lê a caixa da Divisão e atualiza as cotações por e-mail (M30.d). Só LÊ e registra — o envio das
 * solicitações continua externo ao sistema (CLAUDE.md §9.3). Com `processoId`, aplica só aos
 * envios daquele processo. A leitura leva ~15 s: o rótulo diz o que está acontecendo.
 */
export function VerificarRespostasButton({ processoId }: { processoId?: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function verificar() {
    startTransition(async () => {
      const r = await verificarRespostasEmail(processoId);
      if (r.error || !r.data) {
        toast.error(r.error ?? "Não foi possível verificar as respostas.");
        return;
      }
      toast.success(resumirVerificacao(r.data));
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={verificar} disabled={pending} className="gap-2">
      <MailSearch className={pending ? "size-4 animate-pulse" : "size-4"} aria-hidden />
      {pending ? "Lendo e-mails…" : "Verificar respostas"}
    </Button>
  );
}
