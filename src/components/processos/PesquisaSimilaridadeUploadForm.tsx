"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { processarPesquisaSimilaridade } from "@/lib/actions/pesquisaSimilaridade";

export function PesquisaSimilaridadeUploadForm({ processoId }: { processoId: string }) {
  const [trFile, setTrFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trFile) {
      toast.error("Selecione o PDF do Termo de Referência.");
      return;
    }

    startTransition(async () => {
      const buffer = Buffer.from(await trFile.arrayBuffer());
      const resultado = await processarPesquisaSimilaridade(processoId, buffer);
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }

      const itens = resultado.data?.itensProcessados ?? [];
      const sucesso = itens.filter((i) => i.status === "sucesso").length;
      const erro = itens.filter((i) => i.status === "erro").length;
      const ignorado = itens.filter((i) => i.status === "ignorado").length;

      const detalhes = [
        erro > 0 ? `${erro} erro${erro > 1 ? "s" : ""}` : null,
        ignorado > 0 ? `${ignorado} ignorado${ignorado > 1 ? "s" : ""}` : null,
      ].filter(Boolean);

      const mensagem = `${sucesso} de ${itens.length} item(ns) processado(s) com sucesso${
        detalhes.length > 0 ? ` (${detalhes.join(", ")})` : ""
      }.`;

      if (erro > 0) {
        toast.warning(mensagem);
      } else {
        toast.success(mensagem);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="tr-pdf">
          Termo de Referência (PDF)
        </label>
        <Input
          id="tr-pdf"
          type="file"
          accept="application/pdf"
          onChange={(e) => setTrFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Processando..." : "Buscar contratos similares"}
      </Button>
    </form>
  );
}
