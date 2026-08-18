"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { atualizarStatusProcesso } from "@/lib/actions/processos";
import { STATUS_CONFIG, type StatusDominio } from "@/lib/domain/status";
import { SELECT_CLASS as SELECT_BASE } from "@/components/common/selectClass";
import { cn } from "@/lib/utils";

const SELECT_CLASS = cn(SELECT_BASE, "w-full");

const STATUS_PARA_PRISMA: Record<
  StatusDominio,
  "aderente" | "parcial" | "nao_aderente" | "pendente"
> = {
  aderente: "aderente",
  parcial: "parcial",
  "nao-aderente": "nao_aderente",
  pendente: "pendente",
};

const OPCOES_STATUS: StatusDominio[] = ["pendente", "parcial", "nao-aderente", "aderente"];

/**
 * Aprovação manual do status de aderência (IN 65/2021). Separado da fase de
 * andamento (`faseAndamento`, tag operacional livre): esta é a decisão de
 * conformidade, exige papel "revisão" e justificativa registrada em
 * auditoria — é o que tira o processo da fila de trabalho e dos alertas do
 * dashboard, não a fase.
 */
export function AlterarStatusDialog({
  processoId,
  numero,
  statusAtual,
}: {
  processoId: string;
  numero: string;
  statusAtual: StatusDominio;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<StatusDominio>(statusAtual);
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const resultado = await atualizarStatusProcesso({
        processoId,
        status: STATUS_PARA_PRISMA[status],
        justificativa,
      });
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      toast.success(
        `Status do processo ${numero} atualizado para "${STATUS_CONFIG[status].label}".`,
      );
      setOpen(false);
      setJustificativa("");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setStatus(statusAtual);
          setJustificativa("");
        }
      }}
    >
      <Dialog.Trigger
        render={
          <Button variant="outline" size="sm" className="gap-2">
            <ShieldCheck className="size-4" aria-hidden />
            <span className="hidden sm:inline">Alterar status</span>
          </Button>
        }
      />

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-popover p-6 shadow-lg transition-all duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Dialog.Title className="text-base font-semibold text-foreground">
                Alterar status de aderência — {numero}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Aderência à IN 65/2021. Não move preços nem fontes — só registra a decisão, com
                justificativa, na auditoria do processo.
              </Dialog.Description>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Novo status</label>
              <select
                className={SELECT_CLASS}
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusDominio)}
              >
                {OPCOES_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_CONFIG[s].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Justificativa</label>
              <Textarea
                placeholder="Ex.: pesquisa de preço concluída fora do sistema; fonte pública registrada retroativamente."
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                minLength={10}
                required
              />
              <p className="text-xs text-muted-foreground">
                Mínimo de 10 caracteres. Fica registrada no histórico de auditoria do processo.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Dialog.Close
                render={
                  <Button type="button" variant="outline" size="sm" disabled={enviando}>
                    Cancelar
                  </Button>
                }
              />
              <Button
                type="submit"
                size="sm"
                disabled={enviando || justificativa.trim().length < 10}
              >
                {enviando ? "Salvando…" : "Salvar status"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
