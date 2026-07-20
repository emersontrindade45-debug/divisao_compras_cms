"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarPlanilhaCotacao } from "@/lib/actions/salvarPlanilhaCotacao";

export function PlanilhaCotacaoForm({
  processoId,
  defaultUrl,
}: {
  processoId: string;
  defaultUrl?: string;
}) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSalvar() {
    if (!url.trim()) {
      toast.error("Cole o link da planilha de cotação do Google Sheets.");
      return;
    }
    startTransition(async () => {
      const res = await salvarPlanilhaCotacao(processoId, url.trim());
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Planilha de cotação salva. Os preços serão preenchidos nesta planilha.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Planilha de cotação (destino)</p>
          <p className="text-xs text-muted-foreground">
            Planilha onde os preços públicos serão preenchidos ao clicar em &ldquo;Preencher
            cotação&rdquo;. Se não informada, será usada a planilha de origem.
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
          placeholder="Cole o link da planilha de cotação do Google Sheets…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={pending}
          className="flex-1"
          aria-label="Link da planilha de cotação do Google Sheets"
        />
        <Button onClick={handleSalvar} disabled={pending} size="sm" className="shrink-0">
          <Save className="size-4" aria-hidden />
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
