"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { coletarExemplosIa } from "@/lib/actions/coletarExemplosIa";

/**
 * Atualiza os exemplos da IA (M30.d): busca o trecho anonimizado dos casos que a Divisão decidiu ou
 * conferiu. O que a IA faz com eles depende da chave `IA_EXEMPLOS`, que fica desligada até a medição.
 * A coleta também roda sozinha de hora em hora; o botão serve para não esperar.
 */
export function ColetarExemplosIa() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function coletar() {
    startTransition(async () => {
      const r = await coletarExemplosIa();
      if (r.error || !r.data) {
        toast.error(r.error ?? "Não foi possível atualizar os exemplos.");
        return;
      }
      const d = r.data;
      const rejeitados = Object.values(d.rejeitados).reduce((a, b) => a + b, 0);
      toast.success(
        d.pedidos === 0 && d.atualizados === 0 && d.removidos === 0
          ? `Nada novo: os ${d.jaTinham} caso(s) decidido(s) já são exemplos.`
          : `${d.gravados} exemplo(s) novo(s) guardado(s)` +
              (d.atualizados ? `, ${d.atualizados} corrigido(s)` : "") +
              (d.removidos ? `, ${d.removidos} apagado(s) por não passarem no filtro de anonimato (serão coletados de novo, limpos)` : "") +
              (rejeitados ? `, ${rejeitados} recusado(s) por ainda parecerem conter dado pessoal` : "") +
              (d.semTexto ? `, ${d.semTexto} sem texto` : "") +
              (d.restantes > 0 ? `. Faltam ${d.restantes}: clique de novo.` : "."),
      );
      router.refresh();
    });
  }

  return (
    <section aria-label="Exemplos da IA" className="space-y-2 rounded-md border border-dashed bg-muted/30 p-3">
      <p className="text-sm">
        A IA pode aprender com os casos que você decidiu ou conferiu: guardamos só o trecho já <strong>anonimizado</strong> e a classe
        certa (sem e-mail, telefone, documento, link ou valor).
      </p>
      <p className="text-xs text-muted-foreground">
        Só decisão sua entra; a leitura da própria IA nunca vira exemplo. O uso dos exemplos fica desligado até a medição mostrar que não piora.
      </p>
      <Button size="sm" variant="outline" onClick={coletar} disabled={pending}>
        {pending ? "Atualizando…" : "Atualizar exemplos da IA"}
      </Button>
    </section>
  );
}
