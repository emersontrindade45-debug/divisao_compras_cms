"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { verificarRespostasEmail } from "@/lib/actions/verificarRespostasEmail";
import { lerHistorico, planejarFatias } from "@/lib/domain/cotacaoEmail/historico";
import { resumirVerificacao, type ResumoVerificacao } from "@/lib/domain/cotacaoEmail/resumo";

/** Quanto do histórico a leitura percorre, de hoje para trás. */
const DIAS_HISTORICO = 360;

/**
 * Importa o histórico da caixa da Divisão em fatias de 30 dias, da mais recente para a mais
 * antiga (M30.d). Cada fatia é uma chamada própria: a leitura inteira não caberia no prazo de uma
 * função. Idempotente — pode ser repetida sem duplicar nada. Só LÊ e registra (CLAUDE.md §9.3).
 */
export function HistoricoRespostasButton() {
  const [pending, startTransition] = useTransition();
  const [progresso, setProgresso] = useState(0);
  const router = useRouter();
  const total = planejarFatias(DIAS_HISTORICO).length;

  function importar() {
    startTransition(async () => {
      setProgresso(0);
      const r = await lerHistorico(
        DIAS_HISTORICO,
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
      toast.success(`Histórico de ${DIAS_HISTORICO} dias lido. ${resumirVerificacao(r.totais as unknown as ResumoVerificacao)}`);
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={importar} disabled={pending} className="gap-2">
      <History className={pending ? "size-4 animate-pulse" : "size-4"} aria-hidden />
      {pending ? `Lendo histórico… ${progresso}/${total}` : "Importar histórico"}
    </Button>
  );
}
