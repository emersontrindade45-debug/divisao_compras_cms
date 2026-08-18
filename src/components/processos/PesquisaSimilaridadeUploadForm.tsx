"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { extrairTR, buscarSimilaridadeItens } from "@/lib/actions/pesquisaSimilaridade";
import { useElapsedSeconds } from "@/hooks/useElapsedSeconds";

export function PesquisaSimilaridadeUploadForm({ processoId }: { processoId: string }) {
  const [trFile, setTrFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const [fase, setFase] = useState<"extraindo" | "buscando" | null>(null);
  const segundosDecorridos = useElapsedSeconds(pending);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trFile) {
      toast.error("Selecione o PDF do Termo de Referência.");
      return;
    }

    startTransition(async () => {
      // Duas Server Actions em sequência, não uma: cada requisição tem seu próprio teto de
      // tempo (`maxDuration`), então a extração do TR — o que o assistente precisa — sempre
      // termina e persiste antes da busca de contratos similares começar, mesmo que esta
      // última fique parcial num processo com muitos itens (CLAUDE.md §9.64).
      setFase("extraindo");
      const formData = new FormData();
      formData.set("trPdf", trFile);
      const extracao = await extrairTR(processoId, formData);
      if (extracao.error) {
        toast.error(extracao.error);
        setFase(null);
        return;
      }
      toast.success("TR processado — especificações já disponíveis para o assistente.");

      setFase("buscando");
      const resultado = await buscarSimilaridadeItens(processoId);
      setFase(null);
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
        {fase === "extraindo"
          ? `Extraindo TR... (${segundosDecorridos}s)`
          : fase === "buscando"
            ? `Buscando contratos similares... (${segundosDecorridos}s)`
            : "Buscar contratos similares"}
      </Button>
      {pending && (
        <p className="text-xs text-muted-foreground">
          {fase === "extraindo"
            ? "O TR é lido primeiro; assim que terminar, suas especificações já ficam disponíveis para o assistente, mesmo que a busca de contratos similares a seguir demore mais."
            : "Cada item é analisado individualmente pela IA — processos com muitos itens podem levar alguns minutos."}{" "}
          Não atualize a página (F5) enquanto isso, ou o processamento será interrompido.
        </p>
      )}
    </form>
  );
}
