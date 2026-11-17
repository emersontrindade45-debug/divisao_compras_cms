"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { verificarRespostasEmail } from "@/lib/actions/verificarRespostasEmail";
import { INICIO_HISTORICO, diasDesde, lerHistorico, planejarFatias } from "@/lib/domain/cotacaoEmail/historico";
import { resumirVerificacao, type ResumoVerificacao } from "@/lib/domain/cotacaoEmail/resumo";

/**
 * Importa o histórico da caixa da Divisão em fatias de 30 dias, da mais recente para a mais
 * antiga (M30.d). Cada fatia é uma chamada própria: a leitura inteira não caberia no prazo de uma
 * função. Idempotente — pode ser repetida sem duplicar nada. Só LÊ e registra (CLAUDE.md §9.3).
 */
export function HistoricoRespostasButton() {
  const [pending, startTransition] = useTransition();
  const [progresso, setProgresso] = useState(0);
  const [total, setTotal] = useState(0);
  const router = useRouter();

  function importar() {
    startTransition(async () => {
      setProgresso(0);
      // Calculado no clique (não na renderização): depende da data de hoje.
      const diasHistorico = diasDesde(INICIO_HISTORICO, new Date());
      setTotal(planejarFatias(diasHistorico).length);
      const r = await lerHistorico(
        diasHistorico,
        async (fatia) => {
          const resp = await verificarRespostasEmail(undefined, fatia);
          if (resp.error || !resp.data) {
            return { erro: resp.error ?? "Não foi possível ler esta fatia do histórico." };
          }
          const { fiosTruncados, ...contagens } = resp.data;
          return { truncada: fiosTruncados === true, contagens };
        },
        setProgresso,
      );
      router.refresh();

      if (r.erro) {
        toast.error(`Histórico interrompido: ${r.erro} O que já foi lido ficou gravado.`);
        return;
      }
      if (r.fatiaSemSolucao) {
        toast.warning(
          `Há mais e-mails num único dia do que a leitura comporta (${r.fatiaSemSolucao.desdeDias} dia(s) atrás). O restante do histórico foi lido.`,
        );
        return;
      }
      toast.success(`Histórico de 2026 lido (${diasHistorico} dias). ${resumirVerificacao(r.totais as unknown as ResumoVerificacao)}`);
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={importar} disabled={pending} className="gap-2">
      <History className={pending ? "size-4 animate-pulse" : "size-4"} aria-hidden />
      {pending ? `Lendo histórico… ${progresso}/${total || "?"}` : "Importar histórico"}
    </Button>
  );
}
