"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sincronizarPlanilha } from "@/lib/actions/sincronizarPlanilha";

const REGRAS_FORMATO = [
  'A planilha deve estar compartilhada como "qualquer pessoa com o link pode visualizar".',
  "A aba de dados precisa ter o cabeçalho MATERIAL em alguma coluna.",
  "Cada linha de item deve ter texto na coluna MATERIAL e um número (pode ser 0) na coluna MEDIANA.",
  "Linhas de grupo/lote (sem número na coluna MEDIANA) são usadas como agrupadores dos itens seguintes.",
  'Linhas de legenda e rodapé ("Em conformidade...", "Preços Válidos" etc.) são ignoradas automaticamente.',
  'O título do processo vem do nome do arquivo no Google Sheets — inclua uma descrição antes do número (ex.: "e-CPF e e-CNPJ - Proc_2433/2025").',
  "O número do processo é extraído do nome do arquivo (formato: Proc_NNNN/AAAA).",
];

export function SincronizarPlanilhaForm({ defaultUrl }: { defaultUrl?: string }) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [pending, startTransition] = useTransition();
  const [mostrarRegras, setMostrarRegras] = useState(false);
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
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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

      <div>
        <button
          type="button"
          onClick={() => setMostrarRegras((v) => !v)}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none"
        >
          {mostrarRegras ? "Ocultar" : "Ver"} regras do formato da planilha
        </button>

        {mostrarRegras && (
          <ul className="mt-2 space-y-1">
            {REGRAS_FORMATO.map((regra) => (
              <li key={regra} className="flex gap-2 text-xs text-muted-foreground">
                <span className="mt-0.5 shrink-0 text-primary">•</span>
                <span>{regra}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
