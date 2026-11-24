"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIAS, type CategoriaProcesso } from "@/lib/domain/indicadores/painelDemanda";

const CLASSE_SELECT =
  "h-8 rounded-lg border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * Filtros do painel de demanda (ano e categoria). Vivem na URL (`?ano=2025&categoria=bens`): o link da tela
 * filtrada pode ser enviado a outra pessoa, e os demais parâmetros do dashboard (escopo, período, fila) são mantidos.
 */
export function FiltrosPainelDemanda({
  anos,
  ano,
  categoria,
}: {
  anos: number[];
  ano: number;
  categoria: CategoriaProcesso | null;
}) {
  const router = useRouter();
  const atuais = useSearchParams();

  function ir(mudanca: { ano?: string; categoria?: string }) {
    const q = new URLSearchParams(atuais.toString());
    if (mudanca.ano !== undefined) q.set("ano", mudanca.ano);
    if (mudanca.categoria !== undefined) {
      if (mudanca.categoria === "") q.delete("categoria");
      else q.set("categoria", mudanca.categoria);
    }
    router.push(`/dashboard?${q.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Ano
        <select className={CLASSE_SELECT} value={ano} onChange={(e) => ir({ ano: e.target.value })}>
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Categoria do processo
        <select
          className={CLASSE_SELECT}
          value={categoria ?? ""}
          onChange={(e) => ir({ categoria: e.target.value })}
        >
          <option value="">Todas</option>
          {CATEGORIAS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
