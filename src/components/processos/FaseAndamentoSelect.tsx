"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SELECT_CLASS as SELECT_BASE } from "@/components/common/selectClass";
import { cn } from "@/lib/utils";
import { VARIANT_CLASSES } from "@/lib/domain/status";
import { FASE_ANDAMENTO_CONFIG, FASES_ANDAMENTO, type FaseAndamento } from "@/lib/domain/faseAndamento";
import {
  MOTIVO_CORRECAO_CONFIG,
  MOTIVOS_CORRECAO,
  type MotivoCorrecao,
} from "@/lib/domain/motivosCorrecao";
import { atualizarFaseAndamentoProcesso } from "@/lib/actions/processos";

/**
 * Tag de fase de andamento SELECIONÁVEL direto na listagem — troca a fase
 * sem precisar abrir o processo. A cor do gatilho reflete a fase atual (os
 * mesmos tokens semânticos do `StatusBadge`), então ela já funciona como
 * badge quando fechada.
 *
 * Ir para "Em correção" abre um diálogo de motivo (M30.0): é retrabalho, e o
 * indicador do dashboard separa falha documental das demais causas.
 */
export function FaseAndamentoSelect({
  processoId,
  fase,
}: {
  processoId: string;
  fase: FaseAndamento;
}) {
  const [pending, startTransition] = useTransition();
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [motivo, setMotivo] = useState<MotivoCorrecao>(MOTIVOS_CORRECAO[0]);
  const [texto, setTexto] = useState("");
  const router = useRouter();

  function salvar(valor: string, motivoEscolhido?: { codigo: MotivoCorrecao; texto?: string }) {
    startTransition(async () => {
      const res = await atualizarFaseAndamentoProcesso(processoId, valor, motivoEscolhido);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setPedindoMotivo(false);
      toast.success("Fase do processo atualizada.");
      router.refresh();
    });
  }

  function handleChange(valor: string | null) {
    if (!valor || valor === fase) return;
    if (valor === "em_correcao") {
      setMotivo(MOTIVOS_CORRECAO[0]);
      setTexto("");
      setPedindoMotivo(true);
      return;
    }
    salvar(valor);
  }

  function handleConfirmarMotivo(e: FormEvent) {
    e.preventDefault();
    salvar("em_correcao", { codigo: motivo, texto: texto.trim() || undefined });
  }

  const textoObrigatorio = motivo === "outro";
  const podeConfirmar = !pending && (!textoObrigatorio || texto.trim().length >= 5);

  return (
    <>
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

      <Dialog.Root open={pedindoMotivo} onOpenChange={(aberto) => !pending && setPedindoMotivo(aberto)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-popover p-6 shadow-lg transition-all duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <form onSubmit={handleConfirmarMotivo} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Dialog.Title className="text-base font-semibold text-foreground">
                  Motivo da correção
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Fica registrado na auditoria do processo e alimenta o indicador de retrabalho do
                  dashboard.
                </Dialog.Description>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={`motivo-${processoId}`} className="text-sm font-medium">
                  Motivo
                </label>
                <select
                  id={`motivo-${processoId}`}
                  className={cn(SELECT_BASE, "w-full")}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value as MotivoCorrecao)}
                >
                  {MOTIVOS_CORRECAO.map((m) => (
                    <option key={m} value={m}>
                      {MOTIVO_CORRECAO_CONFIG[m].label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={`motivo-texto-${processoId}`} className="text-sm font-medium">
                  {textoObrigatorio ? "Descrição" : "Observação (opcional)"}
                </label>
                <Textarea
                  id={`motivo-texto-${processoId}`}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  maxLength={500}
                  required={textoObrigatorio}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Dialog.Close
                  render={
                    <Button type="button" variant="outline" size="sm" disabled={pending}>
                      Cancelar
                    </Button>
                  }
                />
                <Button type="submit" size="sm" disabled={!podeConfirmar}>
                  {pending ? "Salvando…" : "Mover para correção"}
                </Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
