"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sincronizarPlanilha } from "@/lib/actions/sincronizarPlanilha";
import { useAssistente } from "@/components/assistente/AssistenteDock";

const REGRAS_FORMATO = [
  'A planilha deve estar compartilhada como "qualquer pessoa com o link pode visualizar".',
  "A aba de dados precisa ter o cabeçalho MATERIAL em alguma coluna.",
  "Cada linha com texto na coluna MATERIAL vira um item — sem outra condição (mediana, preço ou legenda).",
  "Linhas sem texto em MATERIAL (lote/grupo, rodapé) são ignoradas.",
  'O título do processo vem do nome do arquivo no Google Sheets — inclua uma descrição antes do número (ex.: "e-CPF e e-CNPJ - Proc_2433/2025").',
  "O número do processo é extraído do nome do arquivo (formato: Proc_NNNN/AAAA).",
  'Para o preço público voltar à planilha automaticamente, a aba precisa ter ao menos uma coluna cujo cabeçalho comece com "Preço Público" (ex.: "Preço Público I"); sem essa coluna, o valor não é escrito em lugar nenhum.',
  "A data de abertura informada só vale na primeira importação do processo; ela é o ponto de partida das métricas de tempo do dashboard.",
  "O preço só é escrito em célula vazia dessa coluna — preço já lançado ali (manual ou de sincronização anterior) nunca é sobrescrito; se todas as colunas de preço público da linha já estiverem ocupadas, o item fica sem ser preenchido.",
];

/** Hoje no fuso do navegador, no formato do `<input type="date">`. */
function hojeLocal(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function SincronizarPlanilhaForm({ defaultUrl }: { defaultUrl?: string }) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  // A data de abertura real é o início das métricas de tempo do dashboard
  // (M30.0). O servidor só a usa na PRIMEIRA importação do processo; numa
  // ressincronização ela é ignorada (o form não sabe se o processo já existe).
  const [dataAbertura, setDataAbertura] = useState(hojeLocal);
  const [pending, startTransition] = useTransition();
  const [mostrarRegras, setMostrarRegras] = useState(false);
  const router = useRouter();
  const assistente = useAssistente();

  function handleSincronizar() {
    if (!url.trim()) {
      toast.error("Cole o link da planilha do Google Sheets.");
      return;
    }
    if (!dataAbertura) {
      toast.error("Informe a data de abertura do processo.");
      return;
    }
    startTransition(async () => {
      const res = await sincronizarPlanilha(url.trim(), dataAbertura);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const d = res.data!;
      toast.success(
        `Processo ${d.numero} sincronizado: ${d.itensImportados} item(ns) e ${d.precosImportados} preço(s).`,
      );
      router.refresh();
      // Notifica o assistente para recarregar a lista de itens — sem isso o
      // botão "Adicionar à lista" continua desabilitado até F5.
      assistente?.recarregarItens();
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
        <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          Abertura (1ª importação)
          <Input
            type="date"
            value={dataAbertura}
            max={hojeLocal()}
            onChange={(e) => setDataAbertura(e.target.value)}
            disabled={pending}
            required
            className="w-40"
            aria-label="Data de abertura do processo"
          />
        </label>
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
