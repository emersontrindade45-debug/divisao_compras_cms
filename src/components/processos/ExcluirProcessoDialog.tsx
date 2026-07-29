"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { excluirProcesso } from "@/lib/actions/processos";

export function ExcluirProcessoDialog({
  processoId,
  numero,
}: {
  processoId: string;
  numero: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleExcluir() {
    startTransition(async () => {
      const res = await excluirProcesso(processoId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Processo ${numero} excluído.`);
      router.push("/processos");
    });
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger
        render={
          <Button variant="destructive" size="sm">
            <Trash2 className="size-3.5" aria-hidden />
            Excluir processo
          </Button>
        }
      />

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-popover p-6 shadow-lg transition-all duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Dialog.Title className="text-base font-semibold text-foreground">
                Excluir processo
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Tem certeza que deseja excluir o processo{" "}
                <span className="font-medium text-foreground">{numero}</span>? Todos os itens,
                fontes, evidências e cotações vinculados serão removidos permanentemente. Esta ação
                não pode ser desfeita.
              </Dialog.Description>
            </div>

            <div className="flex justify-end gap-2">
              <Dialog.Close
                render={
                  <Button variant="outline" size="sm" disabled={pending}>
                    Cancelar
                  </Button>
                }
              />
              <Button
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={handleExcluir}
              >
                <Trash2 className="size-3.5" aria-hidden />
                {pending ? "Excluindo…" : "Excluir permanentemente"}
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
