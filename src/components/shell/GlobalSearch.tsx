"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ResultadoBuscaGlobal } from "@/lib/actions/buscaGlobal";

const RESULTADO_VAZIO: ResultadoBuscaGlobal = { processos: [], fornecedores: [] };
const MIN_CARACTERES = 2;
const DEBOUNCE_MS = 220;

interface ItemNavegavel {
  key: string;
  href: string;
}

function achatar(resultado: ResultadoBuscaGlobal): ItemNavegavel[] {
  return [
    ...resultado.processos.map((p) => ({ key: `processo-${p.id}`, href: `/processos/${p.id}` })),
    ...resultado.fornecedores.map((f) => ({ key: `fornecedor-${f.id}`, href: "/fornecedores" })),
  ];
}

export function GlobalSearch() {
  const router = useRouter();
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  const [query, setQuery] = useState("");
  const [resultado, setResultado] = useState<ResultadoBuscaGlobal>(RESULTADO_VAZIO);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const termo = query.trim();
  const itensAchatados = achatar(resultado);
  const temResultados = itensAchatados.length > 0;

  // Busca com debounce; cancela requests obsoletas via AbortController.
  // O dropdown só aparece com termo >= MIN_CARACTERES, então não é preciso
  // (nem permitido pelo lint) resetar estado sincronamente aqui.
  useEffect(() => {
    if (termo.length < MIN_CARACTERES) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/busca?q=${encodeURIComponent(termo)}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error("Falha na busca");
          return res.json() as Promise<ResultadoBuscaGlobal>;
        })
        .then((data) => {
          setResultado(data);
          setActiveIndex(-1);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setResultado(RESULTADO_VAZIO);
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [termo]);

  useEffect(() => {
    return () => {
      if (blurTimeout.current) clearTimeout(blurTimeout.current);
    };
  }, []);

  const mostrarDropdown = open && termo.length >= MIN_CARACTERES;
  const idOpcaoAtiva =
    activeIndex >= 0 && itensAchatados[activeIndex]
      ? `${baseId}-${itensAchatados[activeIndex].key}`
      : undefined;

  function fechar() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      fechar();
      return;
    }
    if (!mostrarDropdown || !temResultados) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % itensAchatados.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? itensAchatados.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      const alvo = itensAchatados[activeIndex];
      if (alvo) {
        event.preventDefault();
        router.push(alvo.href);
        fechar();
      }
    }
  }

  function handleBlur() {
    // Delay para permitir o clique num item antes de fechar.
    blurTimeout.current = setTimeout(() => setOpen(false), 120);
  }

  return (
    <div ref={containerRef} className="relative max-w-md flex-1">
      <Search
        className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        role="combobox"
        aria-expanded={mostrarDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={idOpcaoAtiva}
        aria-label="Buscar processos e fornecedores"
        placeholder="Buscar processos, fornecedores…"
        className="pl-8"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />

      {mostrarDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover shadow-md">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Buscando…
            </div>
          )}

          <ul id={listboxId} role="listbox" aria-label="Resultados da busca" className="max-h-80 overflow-y-auto py-1">
            {resultado.processos.length > 0 && (
              <li role="presentation">
                <div className="px-3 py-1 text-xs font-medium text-muted-foreground">Processos</div>
                <ul role="presentation">
                  {resultado.processos.map((p) => {
                    const indice = itensAchatados.findIndex((i) => i.key === `processo-${p.id}`);
                    const ativo = indice === activeIndex;
                    return (
                      <li key={p.id} role="presentation">
                        <Link
                          id={`${baseId}-processo-${p.id}`}
                          role="option"
                          aria-selected={ativo}
                          href={`/processos/${p.id}`}
                          onMouseEnter={() => setActiveIndex(indice)}
                          onClick={fechar}
                          className={`block px-3 py-1.5 text-sm ${ativo ? "bg-accent text-accent-foreground" : ""}`}
                        >
                          <span className="font-medium tabular-nums">{p.numero}</span>
                          <span className="ml-2 text-muted-foreground">{p.objeto}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            )}

            {resultado.fornecedores.length > 0 && (
              <li role="presentation">
                <div className="px-3 py-1 text-xs font-medium text-muted-foreground">Fornecedores</div>
                <ul role="presentation">
                  {resultado.fornecedores.map((f) => {
                    const indice = itensAchatados.findIndex((i) => i.key === `fornecedor-${f.id}`);
                    const ativo = indice === activeIndex;
                    return (
                      <li key={f.id} role="presentation">
                        <Link
                          id={`${baseId}-fornecedor-${f.id}`}
                          role="option"
                          aria-selected={ativo}
                          href="/fornecedores"
                          onMouseEnter={() => setActiveIndex(indice)}
                          onClick={fechar}
                          className={`block px-3 py-1.5 text-sm ${ativo ? "bg-accent text-accent-foreground" : ""}`}
                        >
                          <span className="font-medium">{f.razaoSocial}</span>
                          <span className="ml-2 text-muted-foreground">
                            {f.cnpj} · {f.cidade}/{f.estado}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            )}

            {!loading && !temResultados && (
              <li role="presentation" className="px-3 py-2 text-sm text-muted-foreground">
                Nenhum resultado para “{termo}”
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
