"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { descartarResultadoSimilaridade } from "@/lib/actions/descartarResultadoSimilaridade";

export function DescartarResultadoButton({ resultadoId }: { resultadoId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleDescartar() {
    startTransition(async () => {
      const res = await descartarResultadoSimilaridade(resultadoId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Candidato removido da lista");
      router.refresh();
    });
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={handleDescartar}
      disabled={pending}
      aria-label="Remover candidato da lista"
    >
      <X className="size-3.5" aria-hidden />
      {pending ? "Removendo…" : "Remover"}
    </Button>
  );
}
