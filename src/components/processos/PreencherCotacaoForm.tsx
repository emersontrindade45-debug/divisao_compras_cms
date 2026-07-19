"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { preencherCotacao } from "@/lib/actions/preencherCotacao";
import { useElapsedSeconds } from "@/hooks/useElapsedSeconds";

export function PreencherCotacaoForm({ processoId }: { processoId: string }) {
  const [pending, startTransition] = useTransition();
  const segundosDecorridos = useElapsedSeconds(pending);

  function handleClick() {
    startTransition(async () => {
      const resultado = await preencherCotacao(processoId);
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }

      const { spreadsheetUrl, itensPreenchidos, itensSemCandidato, itensSemLinhaCorrespondente } =
        resultado.data!;
      const partes = [
        itensSemCandidato > 0 ? `${itensSemCandidato} sem candidato de preço público` : null,
        itensSemLinhaCorrespondente.length > 0
          ? `${itensSemLinhaCorrespondente.length} sem linha correspondente na planilha`
          : null,
      ].filter(Boolean);

      const mensagem =
        partes.length > 0
          ? `${itensPreenchidos} item(ns) preenchido(s) (${partes.join(", ")}).`
          : `${itensPreenchidos} item(ns) preenchido(s) com sucesso.`;

      if (itensSemLinhaCorrespondente.length > 0) {
        toast.warning(
          `Itens sem linha correspondente na planilha (verifique a descrição): ${itensSemLinhaCorrespondente.join("; ")}`,
          { duration: 30_000 },
        );
      }

      toast.success(mensagem, {
        duration: 30_000,
        action: {
          label: "Abrir planilha",
          onClick: () => window.open(spreadsheetUrl, "_blank", "noopener,noreferrer"),
        },
      });
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Preencher cotação</p>
        <p className="text-xs text-muted-foreground">
          Escreve os melhores preços públicos encontrados na pesquisa de similaridade (até 5 por
          item) diretamente na planilha de cotação já sincronizada deste processo, casando cada
          item pela descrição (coluna MATERIAL).
        </p>
      </div>
      <Button type="button" onClick={handleClick} disabled={pending} size="sm">
        {pending ? `Preenchendo... (${segundosDecorridos}s)` : "Preencher cotação"}
      </Button>
      {pending && (
        <p className="text-xs text-muted-foreground">
          Escrevendo os preços no Google Sheets. Não atualize a página (F5) enquanto isso, ou a
          operação será interrompida.
        </p>
      )}
    </div>
  );
}
