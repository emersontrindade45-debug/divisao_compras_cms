"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { processarPesquisaSimilaridade } from "@/lib/actions/pesquisaSimilaridade";
import { useElapsedSeconds } from "@/hooks/useElapsedSeconds";

export function PesquisaSimilaridadeUploadForm({ processoId }: { processoId: string }) {
  const [trFile, setTrFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const segundosDecorridos = useElapsedSeconds(pending);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trFile) {
      toast.error("Selecione o PDF do Termo de Referência.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("trPdf", trFile);
      const resultado = await processarPesquisaSimilaridade(processoId, formData);
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }

      const itens = resultado.data?.itensProcessados ?? [];
      const sucesso = itens.filter((i) => i.status === "sucesso").length;
      const erro = itens.filter((i) => i.status === "erro").length;
      const ignorado = itens.filter((i) => i.status === "ignorado").length;
      const comResultado = itens.filter((i) => i.status === "sucesso" && i.totalCandidatos > 0).length;
      const semResultado = itens.filter((i) => i.status === "sucesso" && i.totalCandidatos === 0).length;

      const detalhes = [
        erro > 0 ? `${erro} erro${erro > 1 ? "s" : ""}` : null,
        ignorado > 0 ? `${ignorado} ignorado${ignorado > 1 ? "s" : ""}` : null,
        semResultado > 0
          ? `${semResultado} sem contrato similar encontrado no PNCP — use o assistente de IA para refinar a busca`
          : null,
      ].filter(Boolean);

      const mensagem = `${sucesso} de ${itens.length} item(ns) processado(s)${
        comResultado > 0 ? `, ${comResultado} com contratos similares` : ""
      }${detalhes.length > 0 ? `. ${detalhes.join(". ")}` : "."}`;

      if (erro > 0) {
        toast.warning(mensagem);
      } else if (comResultado === 0) {
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
        {pending ? `Processando... (${segundosDecorridos}s)` : "Buscar contratos similares"}
      </Button>
      {pending && (
        <p className="text-xs text-muted-foreground">
          Cada item é analisado individualmente pela IA — processos com muitos itens podem levar
          alguns minutos. Não atualize a página (F5) enquanto isso, ou o processamento será
          interrompido.
        </p>
      )}
    </form>
  );
}
