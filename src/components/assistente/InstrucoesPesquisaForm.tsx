"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LIMITE_CARACTERES_INSTRUCAO } from "@/lib/assistente/instrucoes";
import { salvarInstrucao } from "@/lib/actions/instrucoesPesquisa";

export type EscopoForm = "global" | "categoria" | "processo";

/**
 * Editor de um nível de instrução de pesquisa.
 *
 * Um formulário por nível, e não um só com seletor de escopo: os três textos são
 * lidos juntos pelo assistente (global → categoria → processo) e o servidor
 * precisa vê-los lado a lado para saber o que já está dito onde.
 */
export function InstrucoesPesquisaForm({
  escopo,
  titulo,
  descricao,
  categoriaInicial = "",
  processoId,
  conteudoInicial = "",
  versao,
  podeEditar,
}: {
  escopo: EscopoForm;
  titulo: string;
  descricao: string;
  categoriaInicial?: string;
  processoId?: string;
  conteudoInicial?: string;
  versao?: number;
  /** false para papel `pesquisa`: o texto fica legível, mas não editável. */
  podeEditar: boolean;
}) {
  const [categoria, setCategoria] = useState(categoriaInicial);
  const [conteudo, setConteudo] = useState(conteudoInicial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const restantes = LIMITE_CARACTERES_INSTRUCAO - conteudo.length;
  const excedeu = restantes < 0;

  function handleSalvar() {
    if (escopo === "categoria" && !categoria.trim()) {
      toast.error("Informe a categoria a que esta regra se aplica.");
      return;
    }
    if (excedeu) {
      toast.error(`Reduza o texto em ${Math.abs(restantes)} caractere(s).`);
      return;
    }

    startTransition(async () => {
      const res = await salvarInstrucao({
        escopo,
        ...(escopo === "categoria" ? { categoria: categoria.trim() } : {}),
        ...(escopo === "processo" && processoId ? { processoId } : {}),
        conteudo,
        ativo: true,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Instruções salvas (versão ${res.data?.versao ?? "?"}).`);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-medium">
          {titulo}
          {versao !== undefined && versao > 1 && (
            <span className="text-xs font-normal text-muted-foreground">versão {versao}</span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>

      {escopo === "categoria" && (
        <Input
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          disabled={!podeEditar || pending}
          placeholder="Categoria (ex.: mobiliário, informática)"
          aria-label="Categoria"
        />
      )}

      <Textarea
        value={conteudo}
        onChange={(e) => setConteudo(e.target.value)}
        disabled={!podeEditar || pending}
        rows={6}
        placeholder={
          "Ex.: para cadeiras, exigir que o candidato mencione o mecanismo (relax, sincronizado) —\n" +
          "cadeira fixa não é comparável a giratória mesmo com descrição parecida."
        }
        aria-label={`Instruções — ${titulo}`}
        aria-invalid={excedeu || undefined}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={excedeu ? "text-xs text-danger-strong" : "text-xs text-muted-foreground"}>
          {excedeu
            ? `${Math.abs(restantes)} caractere(s) acima do limite`
            : `${restantes} caractere(s) restantes`}
        </p>
        {podeEditar ? (
          <Button onClick={handleSalvar} disabled={pending || excedeu} size="sm">
            <Save aria-hidden />
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        ) : (
          // Botão desabilitado sem explicação seria um elemento morto na tela
          // (CLAUDE.md §9.40): quem não pode editar recebe o motivo.
          <p className="text-xs text-muted-foreground">
            Somente perfis de revisão ou aprovação podem editar.
          </p>
        )}
      </div>
    </section>
  );
}
