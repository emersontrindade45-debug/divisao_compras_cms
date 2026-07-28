"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adicionarCandidatoSugerido } from "@/lib/actions/assistente";
import type { CandidatoSugerido } from "@/lib/assistente/sugestoes";

// Cartões dos candidatos que a busca do assistente encontrou.
//
// O assistente não registra mais nada por conta própria: ele acha, comenta, e
// cada contratação aparece aqui com o link do PNCP para conferência e um botão
// de adicionar. Só o clique grava — decisão tomada com o usuário, que quer abrir
// o edital antes de a contratação entrar na lista do processo.
//
// O cartão manda ao servidor apenas três identificadores (mensagem, candidato,
// item). Valor, órgão e data são relidos da mensagem gravada, então nada que se
// digite aqui no navegador consegue virar preço de uma estimativa pública.

const formatarMoeda = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatarData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export function SugestoesCandidatos({
  mensagemId,
  sugestoes,
  itens,
}: {
  /** Nulo enquanto o turno ainda não foi gravado: sem id não há o que aprovar. */
  mensagemId: string | null;
  sugestoes: CandidatoSugerido[];
  itens: { id: string; descricao: string }[];
}) {
  const router = useRouter();
  const [adicionados, setAdicionados] = useState<Record<string, boolean>>({});
  const [emCurso, setEmCurso] = useState<string | null>(null);
  const [itemEscolhido, setItemEscolhido] = useState<Record<string, string>>({});

  if (sugestoes.length === 0) return null;

  const adicionar = async (sugestao: CandidatoSugerido) => {
    if (!mensagemId) return;
    const itemId =
      itemEscolhido[sugestao.id] ?? sugestao.itemIdSugerido ?? itens[0]?.id ?? null;
    if (!itemId) return;

    setEmCurso(sugestao.id);
    try {
      const resultado = await adicionarCandidatoSugerido({
        mensagemId,
        candidatoId: sugestao.id,
        itemId,
      });
      if (resultado.ok) {
        setAdicionados((atual) => ({ ...atual, [sugestao.id]: true }));
        toast.success(resultado.mensagem);
        // A tabela de candidatos é renderizada no servidor: sem isto o registro
        // entra no banco e a tela ao lado continua a mesma até um F5.
        router.refresh();
      } else {
        toast.error(resultado.mensagem);
      }
    } catch {
      toast.error("Não foi possível adicionar o candidato.");
    } finally {
      setEmCurso(null);
    }
  };

  return (
    <ul className="space-y-2">
      {sugestoes.map((sugestao) => {
        const jaAdicionado = adicionados[sugestao.id] === true;
        const itemId =
          itemEscolhido[sugestao.id] ?? sugestao.itemIdSugerido ?? itens[0]?.id ?? "";
        // Botão que não faz nada é pior que botão ausente (CLAUDE.md §9.40):
        // quando falta processo, item ou id de mensagem, ele sai desabilitado
        // com o motivo no title.
        const impedimento = !mensagemId
          ? "Aguarde o assistente terminar de responder."
          : itens.length === 0
            ? "Abra um processo com itens cadastrados para adicionar candidatos."
            : null;

        return (
          <li
            key={sugestao.id}
            className="space-y-2 rounded-lg border bg-background p-2.5 text-xs"
          >
            <p className="font-medium text-foreground">{sugestao.fonteOrgaoOuId}</p>
            <p className="line-clamp-3 text-muted-foreground">{sugestao.fonteDescricao}</p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono tabular-nums text-foreground">
                {formatarMoeda(sugestao.valorUnitario)}
              </span>
              <span className="text-muted-foreground">{sugestao.unidade}</span>
              <span className="text-muted-foreground">
                {formatarData(sugestao.dataReferencia)}
              </span>
              {sugestao.fonteUrl && (
                <a
                  href={sugestao.fonteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Abrir no PNCP
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </div>

            {jaAdicionado ? (
              <p className="inline-flex items-center gap-1 text-success-strong">
                <Check className="size-3.5" aria-hidden />
                Na lista do processo
              </p>
            ) : (
              <div className="flex items-center gap-2">
                {itens.length > 1 && (
                  <select
                    value={itemId}
                    onChange={(e) =>
                      setItemEscolhido((atual) => ({ ...atual, [sugestao.id]: e.target.value }))
                    }
                    aria-label="Item que receberá o candidato"
                    className="min-w-0 flex-1 rounded-md border bg-background px-1.5 py-1 text-xs"
                  >
                    {itens.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.descricao}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={impedimento !== null || emCurso === sugestao.id}
                  title={impedimento ?? undefined}
                  onClick={() => void adicionar(sugestao)}
                >
                  <Plus aria-hidden />
                  {emCurso === sugestao.id ? "Adicionando…" : "Adicionar à lista"}
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
