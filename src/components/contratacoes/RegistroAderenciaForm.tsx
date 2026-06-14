"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ContratacaoFixture } from "@/lib/fixtures/contratacoes";

type AderenciaValor = "aderente" | "parcial" | "nao-aderente";

interface RegistroAderenciaFormProps {
  contratacao: ContratacaoFixture;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function RegistroAderenciaForm({
  contratacao,
  open,
  onOpenChange,
}: RegistroAderenciaFormProps) {
  const [aderencia, setAderencia] = useState<AderenciaValor | "">(
    contratacao.aderencia === "pendente" ? "" : contratacao.aderencia,
  );
  const [justificativa, setJustificativa] = useState(
    contratacao.justificativaAderencia ?? "",
  );

  const justificativaObrigatoria = aderencia === "parcial" || aderencia === "nao-aderente";

  function handleSalvar() {
    if (!aderencia) {
      toast.error("Selecione a aderência antes de salvar.");
      return;
    }
    if (justificativaObrigatoria && !justificativa.trim()) {
      toast.error("A justificativa é obrigatória para aderência parcial ou não aderente.");
      return;
    }
    onOpenChange(false);
    toast.success("Classificação de aderência registrada.");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Classificar aderência</SheetTitle>
          <p className="text-sm text-muted-foreground font-mono">{contratacao.numero}</p>
          <p className="text-sm text-muted-foreground line-clamp-2">{contratacao.objeto}</p>
        </SheetHeader>

        <div className="space-y-5 py-6">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="aderencia-select">
              Aderência
            </label>
            <Select
              value={aderencia}
              onValueChange={(v) => setAderencia(v as AderenciaValor)}
            >
              <SelectTrigger id="aderencia-select">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aderente">Aderente</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="nao-aderente">Não aderente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="justificativa-textarea">
              Justificativa
              {justificativaObrigatoria && (
                <span className="text-destructive ml-1" aria-hidden>*</span>
              )}
            </label>
            <textarea
              id="justificativa-textarea"
              className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              placeholder={
                justificativaObrigatoria
                  ? "Descreva o motivo da classificação…"
                  : "Observação opcional…"
              }
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
            />
            {justificativaObrigatoria && (
              <p className="text-xs text-muted-foreground">
                Obrigatória para aderência parcial ou não aderente.
              </p>
            )}
          </div>
        </div>

        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar}>Salvar</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
