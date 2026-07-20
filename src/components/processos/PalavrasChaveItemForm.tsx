"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarPalavrasChaveItem } from "@/lib/actions/salvarPalavrasChaveItem";

export function PalavrasChaveItemForm({
  itemId,
  defaultPalavras,
}: {
  itemId: string;
  defaultPalavras: string[];
}) {
  const [palavras, setPalavras] = useState<string[]>(defaultPalavras);
  const [novoTermo, setNovoTermo] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function adicionarTermo() {
    const t = novoTermo.trim();
    if (!t || palavras.includes(t)) return;
    setPalavras((prev) => [...prev, t]);
    setNovoTermo("");
  }

  function removerTermo(termo: string) {
    setPalavras((prev) => prev.filter((p) => p !== termo));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      adicionarTermo();
    }
  }

  function handleSalvar() {
    startTransition(async () => {
      const res = await salvarPalavrasChaveItem(itemId, palavras);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        palavras.length > 0
          ? "Termos de busca salvos. Use-os na próxima pesquisa de similaridade."
          : "Termos de busca removidos. O sistema usará o termo gerado pela IA.",
      );
      router.refresh();
    });
  }

  const dirty =
    JSON.stringify([...palavras].sort()) !==
    JSON.stringify([...defaultPalavras].sort());

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Search className="size-3 text-muted-foreground shrink-0" aria-hidden />
        <span className="text-xs text-muted-foreground">Termos de busca:</span>
        {palavras.length === 0 && (
          <span className="text-xs text-muted-foreground italic">
            automático (gerado pela IA)
          </span>
        )}
        {palavras.map((p) => (
          <span
            key={p}
            className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
          >
            {p}
            <button
              type="button"
              onClick={() => removerTermo(p)}
              className="text-muted-foreground hover:text-destructive ml-0.5"
              aria-label={`Remover "${p}"`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-1.5">
        <Input
          placeholder='Ex.: "lavagem fachada vidro"'
          value={novoTermo}
          onChange={(e) => setNovoTermo(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-7 text-xs flex-1"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2"
          onClick={adicionarTermo}
          disabled={!novoTermo.trim()}
        >
          <Plus className="size-3" />
        </Button>
        {dirty && (
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={handleSalvar}
            disabled={pending}
          >
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Termos salvos aqui substituem a geração automática na próxima pesquisa de similaridade
        deste item. Use palavras-chave específicas do objeto (ex.:&nbsp;
        <span className="font-mono">lavagem fachada vidro</span>).
      </p>
    </div>
  );
}
