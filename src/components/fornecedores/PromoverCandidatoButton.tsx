"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SELECT_CLASS } from "@/components/common/selectClass";
import { promoverCandidatoFornecedor } from "@/lib/actions/candidatosFornecedor";
import { Check } from "lucide-react";

export function PromoverCandidatoButton({
  candidatoId,
  razaoSocial,
  categoriaSugerida,
  categoriasDisponiveis,
  jaCadastrado,
}: {
  candidatoId: string;
  razaoSocial: string;
  categoriaSugerida: string[];
  categoriasDisponiveis: string[];
  jaCadastrado: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [categoriaEscolhida, setCategoriaEscolhida] = useState(categoriasDisponiveis[0] ?? "");
  const router = useRouter();

  if (jaCadastrado) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Check className="size-3" aria-hidden />
        Já cadastrado
      </Badge>
    );
  }

  function promover(categoria?: string[]) {
    startTransition(async () => {
      const res = await promoverCandidatoFornecedor({ candidatoId, categoria });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${razaoSocial} entrou no cadastro de fornecedores.`);
      router.refresh();
    });
  }

  if (categoriaSugerida.length > 0) {
    return (
      <Button size="sm" variant="outline" onClick={() => promover()} disabled={pending}>
        {pending ? "Promovendo…" : "Promover"}
      </Button>
    );
  }

  if (categoriasDisponiveis.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">Sem tag no cadastro para classificar</span>
    );
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger
        render={
          <Button size="sm" variant="outline">
            Promover
          </Button>
        }
      />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-popover p-6 shadow-lg transition-all duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Dialog.Title className="text-base font-semibold text-foreground">
                Escolher categoria
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Este CNAE ainda não tem tag sugerida. Escolha uma categoria já usada no cadastro —
                sem ela o fornecedor some da busca por camada.
              </Dialog.Description>
            </div>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Categoria</span>
              <select
                className={SELECT_CLASS}
                value={categoriaEscolhida}
                onChange={(e) => setCategoriaEscolhida(e.target.value)}
                aria-label="Categoria para promover o candidato"
              >
                {categoriasDisponiveis.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <Dialog.Close
                render={
                  <Button variant="outline" size="sm" disabled={pending}>
                    Cancelar
                  </Button>
                }
              />
              <Button
                size="sm"
                disabled={pending || !categoriaEscolhida}
                onClick={() => promover([categoriaEscolhida])}
              >
                {pending ? "Promovendo…" : "Promover"}
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
