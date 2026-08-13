"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { despromoverResultadoSimilaridade } from "@/lib/actions/promoverFonte";

export function DespromoverFonteDialog({ resultadoId }: { resultadoId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleDespromover() {
    startTransition(async () => {
      const res = await despromoverResultadoSimilaridade(resultadoId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Promoção desfeita: fonte, evidência e preço removidos.");
      router.refresh();
    });
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="text-danger hover:text-danger"
            aria-label="Desfazer promoção e remover fonte"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Remover
          </Button>
        }
      />

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-popover p-6 shadow-lg transition-all duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Dialog.Title className="text-base font-semibold text-foreground">
                Desfazer promoção
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Isso remove permanentemente a fonte, a evidência e o preço que este candidato
                gerou na série do item. O candidato volta a aparecer como não promovido e pode ser
                promovido de novo ou descartado. Esta ação não pode ser desfeita.
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
                onClick={handleDespromover}
              >
                <Trash2 className="size-3.5" aria-hidden />
                {pending ? "Removendo…" : "Remover permanentemente"}
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
