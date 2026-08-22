"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { sugerirCnaesComContagem, buscarCnaeManual } from "@/lib/actions/sugerirCnaesComContagem";
import type { CnaeSugerido } from "@/lib/domain/candidatoSugerido";

interface PainelCnaesProps {
  objeto: string;
  /** Chamado quando o analista aprova a seleção — recebe os códigos marcados. */
  onAprovar: (codigos: string[]) => void;
  buscando: boolean;
}

/**
 * Painel de aprovação dos CNAEs, entre a sugestão da IA e a busca de empresas.
 *
 * Existe porque a proposta automática erra de um jeito que era invisível: para "Limpeza e
 * Conservação Predial" a IA devolve 103 mil empresas, das quais 54.981 são de PINTURA e 7.200 de
 * lavanderia de roupas — e nada na tela indicava isso. Mostrar a contagem ao lado de cada código
 * transforma o palpite em decisão, e o checkbox deixa o analista cortar o que não serve antes de
 * gastar a busca.
 */
export function PainelCnaes({ objeto, onAprovar, buscando }: PainelCnaesProps) {
  const [cnaes, setCnaes] = useState<CnaeSugerido[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [refinamento, setRefinamento] = useState("");
  const [codigoManual, setCodigoManual] = useState("");
  const [sugerindo, setSugerindo] = useState(false);

  async function sugerir() {
    setSugerindo(true);
    try {
      const r = await sugerirCnaesComContagem(objeto, refinamento);
      if (r.cnaes.length === 0) {
        toast.warning("A IA não encontrou atividades para este objeto. Tente refinar.");
        return;
      }

      // Refinar PRESERVA o que o analista já revisou: ele acrescenta contexto para melhorar a
      // proposta, não para perder o trabalho. CNAEs adicionados à mão sobrevivem ao refinamento, e
      // um código que ele havia desmarcado não volta marcado.
      const desmarcadosAntes = new Set(
        (cnaes ?? []).filter((c) => !marcados.has(c.codigo)).map((c) => c.codigo),
      );
      const manuais = (cnaes ?? []).filter((c) => !c.daIa);
      const novos = r.cnaes.filter((c) => !manuais.some((m) => m.codigo === c.codigo));

      setCnaes([...novos, ...manuais]);
      setMarcados((anteriores) => {
        const next = new Set(anteriores);
        for (const c of r.cnaes) if (!desmarcadosAntes.has(c.codigo)) next.add(c.codigo);
        return next;
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      toast.error(`Não foi possível sugerir atividades: ${motivo}`);
    } finally {
      setSugerindo(false);
    }
  }

  async function adicionarManual() {
    const codigo = codigoManual.trim();
    if (!codigo) return;
    try {
      const r = await buscarCnaeManual(codigo);
      if (!r) {
        toast.error(`CNAE ${codigo} não existe na base de empresas.`);
        return;
      }
      if ((cnaes ?? []).some((c) => c.codigo === r.codigo)) {
        toast.info("Este CNAE já está na lista.");
        return;
      }
      setCnaes((a) => [...(a ?? []), r]);
      setMarcados((m) => new Set(m).add(r.codigo));
      setCodigoManual("");
    } catch {
      toast.error("Não foi possível validar o CNAE.");
    }
  }

  const selecionados = (cnaes ?? []).filter((c) => marcados.has(c.codigo));
  const totalEmpresas = selecionados.reduce((s, c) => s + c.empresas, 0);
  const totalLocais = selecionados.reduce((s, c) => s + c.locais, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-muted-foreground" />
          Atividades (CNAE) a buscar
        </CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={sugerir}
          disabled={sugerindo || !objeto}
        >
          <Sparkles className="size-3.5" />
          {sugerindo ? "Analisando…" : cnaes === null ? "Sugerir atividades" : "Refinar"}
        </Button>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <div className="space-y-1">
          <label htmlFor="refinamento" className="text-xs font-medium text-muted-foreground">
            Contexto adicional (opcional)
          </label>
          <Input
            id="refinamento"
            value={refinamento}
            onChange={(e) => setRefinamento(e.target.value)}
            placeholder="ex.: lavagem de fachada com rapel — não queremos lavanderia de roupas"
            className="h-8"
          />
        </div>

        {cnaes !== null && (
          <>
            <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border p-2">
              {cnaes.map((c) => (
                <label
                  key={c.codigo}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    className="accent-primary size-4 shrink-0 cursor-pointer"
                    checked={marcados.has(c.codigo)}
                    aria-label={`Incluir CNAE ${c.codigo}`}
                    onChange={() =>
                      setMarcados((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.codigo)) next.delete(c.codigo);
                        else next.add(c.codigo);
                        return next;
                      })
                    }
                  />
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {c.codigo}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={c.descricao}>
                    {c.descricao}
                  </span>
                  {!c.daIa && (
                    <Badge variant="secondary" className="shrink-0 text-[0.65rem]">
                      manual
                    </Badge>
                  )}
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    {c.empresas.toLocaleString("pt-BR")}
                    <span className="ml-1 opacity-60">({c.locais} local)</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={codigoManual}
                onChange={(e) => setCodigoManual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void adicionarManual();
                  }
                }}
                placeholder="Adicionar CNAE (7 dígitos)"
                className="h-8 w-52"
                aria-label="Adicionar CNAE manualmente"
              />
              <Button type="button" variant="outline" size="sm" onClick={adicionarManual}>
                <Plus className="size-3.5" />
              </Button>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <p className="text-sm text-muted-foreground">
                <strong className="tabular-nums text-foreground">
                  {totalEmpresas.toLocaleString("pt-BR")}
                </strong>{" "}
                empresas em {selecionados.length} atividade(s) ·{" "}
                <span className="tabular-nums">{totalLocais.toLocaleString("pt-BR")}</span> na
                Baixada Santista
              </p>
              <Button
                type="button"
                size="sm"
                className="gap-2"
                disabled={selecionados.length === 0 || buscando}
                onClick={() => onAprovar(selecionados.map((c) => c.codigo))}
              >
                <Search className="size-3.5" />
                {buscando ? "Buscando…" : "Buscar empresas"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
