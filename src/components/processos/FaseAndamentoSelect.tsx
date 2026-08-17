"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { VARIANT_CLASSES } from "@/lib/domain/status";
import { FASE_ANDAMENTO_CONFIG, FASES_ANDAMENTO, type FaseAndamento } from "@/lib/domain/faseAndamento";
import { atualizarFaseAndamentoProcesso } from "@/lib/actions/processos";

/**
 * Tag de fase de andamento SELECIONÁVEL direto na listagem — troca a fase
 * sem precisar abrir o processo. A cor do gatilho reflete a fase atual (os
 * mesmos tokens semânticos do `StatusBadge`), então ela já funciona como
 * badge quando fechada.
 */
export function FaseAndamentoSelect({
  processoId,
  fase,
}: {
  processoId: string;
  fase: FaseAndamento;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(valor: string | null) {
    if (!valor || valor === fase) return;
    startTransition(async () => {
      const res = await atualizarFaseAndamentoProcesso(processoId, valor);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Fase do processo atualizada.");
      router.refresh();
    });
  }

  return (
    <Select value={fase} onValueChange={handleChange} disabled={pending}>
      <SelectTrigger
        size="sm"
        aria-label="Fase de andamento do processo"
        className={cn(
          "rounded-full border-0 px-2.5 py-0 h-6 text-xs font-medium",
          VARIANT_CLASSES[FASE_ANDAMENTO_CONFIG[fase].variant],
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FASES_ANDAMENTO.map((valor) => (
          <SelectItem key={valor} value={valor}>
            {FASE_ANDAMENTO_CONFIG[valor].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
