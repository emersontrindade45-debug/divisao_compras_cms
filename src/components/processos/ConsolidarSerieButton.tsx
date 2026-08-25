"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { consolidarSeriePreco } from "@/lib/actions/precos";

/**
 * Único caminho de UI para `consolidarSeriePreco` — a action existe desde a
 * v1, mas nenhum botão a chamava, então a série ficava presa em "0/0
 * incluídos" mesmo com preços já promovidos/adicionados (§9 do CLAUDE.md).
 * `tipoObjeto` fixo em "aquisicao": é o único valor usado em todo o código
 * hoje (não há campo de domínio que distinga obra de aquisição ainda).
 */
export function ConsolidarSerieButton({ serieId }: { serieId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleConsolidar() {
    startTransition(async () => {
      const res = await consolidarSeriePreco(serieId, "aquisicao");
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const alertas = res.data?.violations.filter((v) => v.severity !== "block") ?? [];
      if (alertas.length > 0) {
        toast.warning(`Série consolidada com ${alertas.length} alerta(s) — revise a memória de cálculo.`);
      } else {
        toast.success("Série consolidada.");
      }
      router.refresh();
    });
  }

  return (
    <Button size="sm" disabled={pending} onClick={handleConsolidar}>
      <TrendingUp className="size-3.5" aria-hidden />
      {pending ? "Consolidando…" : "Consolidar série"}
    </Button>
  );
}
