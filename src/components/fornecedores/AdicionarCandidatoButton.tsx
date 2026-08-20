"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { adicionarCandidatoAPlanilha } from "@/lib/actions/candidatosCnpj";

/**
 * Mesmo padrão de `PromoverFonteButton` (processos): `useTransition` + Server
 * Action + `toast` + `router.refresh()`. Escreve o candidato na planilha de
 * fornecedores (M24) — não cria `Fornecedor` diretamente (docs/PLAN.md M27
 * etapa 6); por isso `router.refresh()` não muda o estado "já é fornecedor"
 * imediatamente (só depois de rodar `/api/admin/sincronizar-fornecedores`).
 */
export function AdicionarCandidatoButton({
  candidatoId,
  jaEhFornecedor,
}: {
  candidatoId: string;
  jaEhFornecedor: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (jaEhFornecedor) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Check className="size-3" aria-hidden />
        Já é fornecedor
      </Badge>
    );
  }

  function handleAdicionar() {
    startTransition(async () => {
      const res = await adicionarCandidatoAPlanilha(candidatoId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.data?.jaExistente) {
        toast.info(`CNPJ já estava na planilha (linha #${res.data.linhaId})`);
      } else {
        toast.success(`Adicionado à planilha de fornecedores (linha #${res.data?.linhaId})`);
      }
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={handleAdicionar} disabled={pending}>
      <UserPlus className="size-3.5" aria-hidden />
      {pending ? "Adicionando…" : "Adicionar à planilha"}
    </Button>
  );
}
