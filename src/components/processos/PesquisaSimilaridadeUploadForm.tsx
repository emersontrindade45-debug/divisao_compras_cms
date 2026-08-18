"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { extrairTR } from "@/lib/actions/pesquisaSimilaridade";
import { useElapsedSeconds } from "@/hooks/useElapsedSeconds";

/**
 * Só upload + extração do TR (sem busca de contratos similares): a busca passou
 * a ser responsabilidade exclusiva do assistente de IA (`buscar_pncp`), que já
 * lê o TR extraído aqui via `ler_tr` e itera o termo de busca em conversa — o
 * fluxo síncrono desta tela ficava sujeito a instabilidade momentânea das APIs
 * públicas (PNCP/Compras.gov), sem chance de o usuário refinar e tentar de novo
 * na mesma interação. Decidido com o usuário em 2026-08-18.
 */
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
      const extracao = await extrairTR(processoId, formData);
      if (extracao.error) {
        toast.error(extracao.error);
        return;
      }
      toast.success(
        "TR processado — use o assistente de IA para buscar contratos similares a partir dele.",
      );
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
        {pending ? `Extraindo TR... (${segundosDecorridos}s)` : "Enviar TR"}
      </Button>
      {pending && (
        <p className="text-xs text-muted-foreground">
          O texto integral do TR fica disponível para o assistente assim que terminar. Não
          atualize a página (F5) enquanto isso, ou o processamento será interrompido.
        </p>
      )}
    </form>
  );
}
