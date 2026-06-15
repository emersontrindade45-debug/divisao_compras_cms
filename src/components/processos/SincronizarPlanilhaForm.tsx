"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sincronizarPlanilha } from "@/lib/actions/sincronizarPlanilha";

export function SincronizarPlanilhaForm({ defaultUrl }: { defaultUrl?: string }) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSincronizar() {
    if (!url.trim()) {
      toast.error("Cole o link da planilha do Google Sheets.");
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
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 sm:flex-row sm:items-center">
      <Input
        type="url"
        inputMode="url"
        placeholder="Cole o link da planilha do Google Sheets do processo…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={pending}
        className="flex-1"
        aria-label="Link da planilha do Google Sheets"
      />
      <Button onClick={handleSincronizar} disabled={pending} className="shrink-0">
        <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden />
        {pending ? "Sincronizando…" : "Sincronizar agora"}
      </Button>
    </div>
  );
}
