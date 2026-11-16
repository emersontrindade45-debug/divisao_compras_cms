"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
// Só o tipo: o módulo carrega a lista do IBGE, que fica no servidor.
import type { Municipio } from "@/lib/domain/municipios/municipios";

/** Mesmo teto da rota do chat (`MAX_MUNICIPIOS_FILTRO`). */
const MAX_CIDADES = 20;

interface FiltroCidadesProps {
  selecionadas: Municipio[];
  onChange: (cidades: Municipio[]) => void;
}

/**
 * Dropdown de cidades com seleção múltipla: digita, escolhe na lista, e a
 * cidade vira um chip removível. Dá para seguir digitando e acrescentar outras.
 */
export function FiltroCidades({ selecionadas, onChange }: FiltroCidadesProps) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Municipio[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const listaId = useId();
  const raiz = useRef<HTMLDivElement>(null);

  const termo = texto.trim();
  const noLimite = selecionadas.length >= MAX_CIDADES;

  useEffect(() => {
    if (termo.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setCarregando(true);
      try {
        const res = await fetch(`/api/municipios?q=${encodeURIComponent(termo)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const dados = (await res.json()) as { municipios?: Municipio[] };
        setResultados(dados.municipios ?? []);
        setDestaque(0);
      } catch (erro) {
        if (erro instanceof DOMException && erro.name === "AbortError") return;
        setResultados([]);
      } finally {
        setCarregando(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [termo]);

  // Fecha a lista ao clicar fora do componente (mas dentro do popover).
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);

  const visiveis = termo.length >= 2 ? resultados : [];
  const estaSelecionada = (m: Municipio) => selecionadas.some((s) => s.codigo === m.codigo);

  function alternar(m: Municipio) {
    if (estaSelecionada(m)) {
      onChange(selecionadas.filter((s) => s.codigo !== m.codigo));
    } else if (!noLimite) {
      onChange([...selecionadas, m]);
    }
    // Limpa o texto para a próxima cidade, mantendo o foco no campo.
    setTexto("");
    setResultados([]);
  }

  return (
    <div ref={raiz} className="space-y-1.5">
      <p className="text-xs font-medium text-foreground">Cidades</p>

      <div className="relative">
        <Input
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAberto(true);
              setDestaque((d) => Math.min(d + 1, Math.max(visiveis.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setDestaque((d) => Math.max(d - 1, 0));
            } else if (e.key === "Enter") {
              // Enter escolhe a cidade destacada; nunca envia o formulário do chat.
              e.preventDefault();
              const m = visiveis[destaque];
              if (m) alternar(m);
            } else if (e.key === "Escape" && aberto) {
              e.stopPropagation();
              setAberto(false);
            }
          }}
          placeholder={noLimite ? `Limite de ${MAX_CIDADES} cidades` : "Digite uma cidade…"}
          disabled={noLimite}
          aria-label="Buscar cidade"
          role="combobox"
          aria-expanded={aberto && termo.length >= 2}
          aria-controls={listaId}
          aria-autocomplete="list"
          className="pr-7"
        />
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />

        {aberto && termo.length >= 2 && (
          <ul
            id={listaId}
            role="listbox"
            aria-label="Cidades encontradas"
            aria-multiselectable
            className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-md"
          >
            {carregando && visiveis.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">Buscando…</li>
            )}
            {!carregando && visiveis.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">
                Nenhuma cidade com esse nome.
              </li>
            )}
            {visiveis.map((m, i) => {
              const marcada = estaSelecionada(m);
              return (
                <li
                  key={m.codigo}
                  role="option"
                  aria-selected={marcada}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => alternar(m)}
                  onMouseEnter={() => setDestaque(i)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5",
                    i === destaque && "bg-accent text-accent-foreground",
                  )}
                >
                  <span>
                    {m.nome} <span className="text-xs text-muted-foreground">{m.uf}</span>
                  </span>
                  {marcada && <Check className="size-3.5" aria-hidden />}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selecionadas.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Cidades selecionadas">
          {selecionadas.map((m) => (
            <li
              key={m.codigo}
              className="inline-flex items-center gap-1 rounded-md border bg-secondary px-1.5 py-0.5 text-xs"
            >
              {m.nome}/{m.uf}
              <button
                type="button"
                onClick={() => onChange(selecionadas.filter((s) => s.codigo !== m.codigo))}
                className="rounded-sm text-muted-foreground hover:text-foreground"
                aria-label={`Remover ${m.nome}/${m.uf}`}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Só traz contratações dessas cidades. Fontes que não informam a cidade do preço (Painel
        de serviços, Compras.gov, SINAPI) ficam de fora enquanto o filtro estiver ativo.
      </p>
    </div>
  );
}
