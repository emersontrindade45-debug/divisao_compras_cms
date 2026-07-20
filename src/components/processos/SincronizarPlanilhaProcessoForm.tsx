"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sincronizarPlanilha } from "@/lib/actions/sincronizarPlanilha";

export function SincronizarPlanilhaProcessoForm({
  defaultUrl,
}: {
  defaultUrl?: string;
}) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSincronizar() {
    if (!url.trim()) {
      toast.error("Cole o link da planilha de origem do Google Sheets.");
      return;
    }
    startTransition(async () => {
      const res = await sincronizarPlanilha(url.trim());
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const d = res.data!;
      toast.success(
        `Processo ${d.numero} sincronizado: ${d.itensImportados} item(ns) e ${d.precosImportados} preço(s).`,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Planilha de origem (sincronização)</p>
          <p className="text-xs text-muted-foreground">
            Planilha do Google Sheets com os itens e preços do processo. Ao sincronizar, os dados
            são importados e atualizados no sistema.
          </p>
        </div>
        {defaultUrl && (
          <a
            href={defaultUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ExternalLink className="size-3" aria-hidden />
            Abrir
          </a>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          type="url"
          inputMode="url"
          placeholder="Cole o link da planilha de origem do Google Sheets…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={pending}
          className="flex-1"
          aria-label="Link da planilha de origem do Google Sheets"
        />
        <Button onClick={handleSincronizar} disabled={pending} size="sm" className="shrink-0">
          <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden />
          {pending ? "Sincronizando…" : "Sincronizar"}
        </Button>
      </div>
    </div>
  );
}
