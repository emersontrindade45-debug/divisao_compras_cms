"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { promoverResultadoSimilaridade } from "@/lib/actions/promoverFonte";

export function PromoverFonteButton({
  resultadoId,
  jaPromovido,
}: {
  resultadoId: string;
  jaPromovido: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (jaPromovido) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Check className="size-3" aria-hidden />
        Promovido
      </Badge>
    );
  }

  function handlePromover() {
    startTransition(async () => {
      const res = await promoverResultadoSimilaridade(resultadoId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Candidato promovido para Fonte");
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={handlePromover} disabled={pending}>
      <ArrowRightCircle className="size-3.5" aria-hidden />
      {pending ? "Promovendo…" : "Promover para Fonte"}
    </Button>
  );
}
