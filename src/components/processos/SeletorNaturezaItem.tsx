"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { atualizarNaturezaItem } from "@/lib/actions/itens";

type Natureza = "bem_consumo" | "servico_continuo";

const NAO_CLASSIFICADO = "nao_classificado";

const LABELS: Record<Natureza, string> = {
  bem_consumo: "Bem de consumo (12 meses)",
  servico_continuo: "Serviço contínuo (18 meses)",
};

export function SeletorNaturezaItem({
  itemId,
  natureza,
}: {
  itemId: string;
  natureza: Natureza | null;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(valor: string | null) {
    const proxima = valor === null || valor === NAO_CLASSIFICADO ? null : (valor as Natureza);
    startTransition(async () => {
      const res = await atualizarNaturezaItem(itemId, proxima);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Classificação do item atualizada.");
      router.refresh();
    });
  }

  return (
    <Select value={natureza ?? NAO_CLASSIFICADO} onValueChange={handleChange} disabled={pending}>
      <SelectTrigger
        size="sm"
        aria-label="Natureza do objeto (define a janela de validade da fonte)"
      >
        <SelectValue placeholder="Classificar item…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NAO_CLASSIFICADO}>Não classificado (usa 24 meses)</SelectItem>
        <SelectItem value="bem_consumo">{LABELS.bem_consumo}</SelectItem>
        <SelectItem value="servico_continuo">{LABELS.servico_continuo}</SelectItem>
      </SelectContent>
    </Select>
  );
}
