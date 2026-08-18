"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Passo do rastro de ferramentas, como a UI o exibe. */
export interface PassoExibido {
  ferramenta: string;
  argumentos: string;
  resumo?: string;
  duracaoMs?: number;
  erro?: string | null;
  /** true entre `passo_inicio` e `passo_fim`. */
  emAndamento: boolean;
}

/**
 * Nome legível de cada ferramenta.
 *
 * O usuário é servidor da Divisão de Compras, não desenvolvedor: `buscar_pncp`
 * não diz nada, "Buscando no PNCP" diz. O rastro existe para ele poder auditar
 * de onde veio cada afirmação da IA — se não for legível, não cumpre a função.
 */
const ROTULOS: Record<string, string> = {
  ler_processo: "Lendo o processo e os itens",
  ler_candidatos: "Lendo os candidatos já encontrados",
  ler_conformidade: "Conferindo a conformidade (IN 65/2021)",
  busca_global: "Procurando o processo",
  buscar_pncp: "Buscando preços e contratações públicas",
  buscar_web: "Pesquisando na web",
  registrar_candidatos: "Registrando candidatos no item",
};

function rotulo(ferramenta: string): string {
  return ROTULOS[ferramenta] ?? ferramenta;
}

/**
 * Extrai o termo/consulta dos argumentos para mostrar ao lado do rótulo.
 *
 * Os argumentos chegam como o JSON cru que o modelo produziu — despejá-lo na
 * tela seria ruído. Quando não dá para interpretar, não mostra nada em vez de
 * mostrar `{"termo":"…"}`.
 */
export function resumirArgumentos(argumentos: string): string | null {
  try {
    const json: unknown = JSON.parse(argumentos);
    if (!json || typeof json !== "object") return null;
    const registro = json as Record<string, unknown>;
    for (const chave of ["termo", "consulta", "termoBuscaUsado"]) {
      const valor = registro[chave];
      if (typeof valor === "string" && valor.trim()) return valor.trim();
    }
    return null;
  } catch {
    return null;
  }
}

export function PassoFerramenta({ passo }: { passo: PassoExibido }) {
  const detalhe = resumirArgumentos(passo.argumentos);
  const falhou = Boolean(passo.erro);

  return (
    <li className="flex items-start gap-2 py-1 text-xs">
      <span className="mt-0.5 shrink-0" aria-hidden>
        {passo.emAndamento ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : falhou ? (
          <AlertCircle className="size-3.5 text-danger-strong" />
        ) : (
          <Check className="size-3.5 text-success" />
        )}
      </span>
      <span className={cn("min-w-0", falhou ? "text-danger-strong" : "text-muted-foreground")}>
        <span className="font-medium">{rotulo(passo.ferramenta)}</span>
        {detalhe && <span className="break-words"> — “{detalhe}”</span>}
        {passo.erro && <span className="block break-words">{passo.erro}</span>}
      </span>
    </li>
  );
}
