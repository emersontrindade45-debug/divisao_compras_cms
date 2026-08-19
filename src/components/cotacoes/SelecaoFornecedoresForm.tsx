"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Mail, Users, Sparkles, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/fornecedores/ScoreBadge";
import { criarCotacao } from "@/lib/actions/cotacoes";
import { sugerirFornecedoresPorObjeto } from "@/lib/actions/fornecedores";
import { cn } from "@/lib/utils";

const TEMPLATE_EMAIL = `Prezado(a) {responsavel},

A Câmara Municipal de Santos está realizando pesquisa de preços para o processo {numero},
cujo objeto é: {objeto}.

Solicitamos gentilmente que V.Sa. nos envie proposta comercial contendo:
- Descrição completa do produto/serviço
- Valor unitário e total
- Prazo de validade da proposta
- CNPJ e dados do responsável

Prazo para retorno: {prazo}

Atenciosamente,
Divisão de Compras — Câmara Municipal de Santos`;

import { SELECT_CLASS as SELECT_BASE } from "@/components/common/selectClass";

const SELECT_CLASS = cn(SELECT_BASE, "w-full max-w-md");

export interface FornecedorOption {
  id: string;
  razaoSocial: string;
  email: string;
  cidade: string;
  estado: string;
  responsavelContato: string;
  categoria: string[];
  score: number;
  taxaResposta: number;
}

export interface ProcessoOption {
  id: string;
  numero: string;
  objeto: string;
}

interface SelecaoFornecedoresFormProps {
  fornecedores: FornecedorOption[];
  processos: ProcessoOption[];
}

export function SelecaoFornecedoresForm({
  fornecedores,
  processos,
}: SelecaoFornecedoresFormProps) {
  const router = useRouter();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [previewAberto, setPreviewAberto] = useState(false);
  const [processoId, setProcessoId] = useState("");
  const [dataLimite, setDataLimite] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [registrando, setRegistrando] = useState(false);
  const [sugerindo, setSugerindo] = useState(false);
  const [categoriasSugeridas, setCategoriasSugeridas] = useState<string[] | null>(null);

  const toggle = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function handleSugerirPorIA() {
    const processo = processos.find((p) => p.id === processoId);
    if (!processo) {
      toast.error("Selecione o processo primeiro — a sugestão usa o objeto dele.");
      return;
    }
    setSugerindo(true);
    try {
      const resultado = await sugerirFornecedoresPorObjeto(processo.objeto);
      setCategoriasSugeridas(resultado.categoriasSugeridas);
      if (resultado.fornecedores.length === 0) {
        toast.warning("Nenhum fornecedor cadastrado casou com o objeto deste processo.");
      } else {
        setSelecionados((prev) => {
          const next = new Set(prev);
          for (const f of resultado.fornecedores) next.add(f.id);
          return next;
        });
        toast.success(`${resultado.fornecedores.length} fornecedor(es) sugerido(s) e marcado(s) abaixo.`);
      }
    } catch {
      toast.error("Não foi possível sugerir fornecedores agora. Tente de novo.");
    } finally {
      setSugerindo(false);
    }
  }

  async function handleCopiarEmails() {
    const emails = fornecedores
      .filter((f) => selecionados.has(f.id) && f.email)
      .map((f) => f.email);
    if (emails.length === 0) {
      toast.warning("Nenhum dos fornecedores selecionados tem e-mail cadastrado.");
      return;
    }
    await navigator.clipboard.writeText(emails.join("; "));
    toast.success(`${emails.length} e-mail(s) copiado(s).`);
  }

  async function handleRegistrar() {
    if (!processoId) {
      toast.error("Selecione o processo da cotação.");
      return;
    }
    if (selecionados.size < 3) {
      toast.warning(
        "A IN 65/2021 exige consulta a no mínimo 3 fornecedores na pesquisa direta (exceções requerem justificativa aprovada).",
      );
    }
    setRegistrando(true);
    const agora = new Date();
    const limite = new Date(`${dataLimite}T23:59:59`);
    let erros = 0;
    for (const fornecedorId of selecionados) {
      const result = await criarCotacao({
        processoId,
        fornecedorId,
        dataEnvio: agora,
        dataLimite: limite,
      });
      if (result.error) erros++;
    }
    setRegistrando(false);
    if (erros > 0) {
      toast.error(`${erros} cotação(ões) não puderam ser registradas.`);
    } else {
      toast.success(
        `${selecionados.size} cotação(ões) registrada(s). O envio do e-mail é feito pela Câmara; o SLA será acompanhado aqui.`,
      );
      setSelecionados(new Set());
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Processo e prazo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Processo</label>
            <select
              className={SELECT_CLASS}
              value={processoId}
              onChange={(e) => setProcessoId(e.target.value)}
            >
              <option value="">Selecione o processo</option>
              {processos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.numero} — {p.objeto}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Prazo de resposta (SLA)</label>
            <input
              type="date"
              className={SELECT_CLASS}
              value={dataLimite}
              onChange={(e) => setDataLimite(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            Seleção de Fornecedores
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleSugerirPorIA}
              disabled={sugerindo || !processoId}
            >
              <Sparkles className="size-3.5" />
              {sugerindo ? "Sugerindo…" : "Sugerir por IA"}
            </Button>
            <Badge variant="secondary" className="tabular-nums">
              {selecionados.size} selecionados
            </Badge>
          </div>
        </CardHeader>
        {categoriasSugeridas !== null && (
          <CardContent className="pt-0 pb-3">
            <p className="text-xs text-muted-foreground">
              {categoriasSugeridas.length > 0 ? (
                <>
                  Categorias identificadas no objeto:{" "}
                  {categoriasSugeridas.map((c) => (
                    <Badge key={c} variant="outline" className="mr-1 text-xs">
                      {c}
                    </Badge>
                  ))}
                </>
              ) : (
                "Nenhuma categoria do cadastro casou com o objeto deste processo."
              )}
            </p>
          </CardContent>
        )}
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-6" />
                <TableHead>Fornecedor</TableHead>
                <TableHead>Categorias</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="tabular-nums">Taxa de resposta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fornecedores.map((f) => {
                const checked = selecionados.has(f.id);
                return (
                  <TableRow
                    key={f.id}
                    className={cn("cursor-pointer", checked && "bg-primary/5")}
                    onClick={() => toggle(f.id)}
                  >
                    <TableCell className="pl-6">
                      <input
                        type="checkbox"
                        readOnly
                        checked={checked}
                        className="accent-primary size-4 cursor-pointer"
                        aria-label={`Selecionar ${f.razaoSocial}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{f.razaoSocial}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.cidade}/{f.estado} · {f.responsavelContato}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {f.categoria.slice(0, 2).map((c) => (
                          <Badge key={c} variant="secondary" className="text-xs">
                            {c}
                          </Badge>
                        ))}
                        {f.categoria.length > 2 && (
                          <Badge variant="secondary" className="text-xs">
                            +{f.categoria.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ScoreBadge score={f.score} />
                    </TableCell>
                    <TableCell>
                      <span className="tabular-nums text-sm">{f.taxaResposta.toFixed(1)}%</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selecionados.size > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" />
              Modelo do e-mail de cotação (envio feito pela Câmara)
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewAberto((v) => !v)}
              className="h-7 text-xs"
            >
              {previewAberto ? "Ocultar" : "Expandir"}
            </Button>
          </CardHeader>
          {previewAberto && (
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                {TEMPLATE_EMAIL}
              </pre>
            </CardContent>
          )}
          <CardContent className={cn("flex items-center justify-between", previewAberto && "pt-0")}>
            <p className="text-sm text-muted-foreground">
              {selecionados.size} cotação{selecionados.size > 1 ? "ões" : ""} será
              {selecionados.size > 1 ? "ão" : ""} registrada{selecionados.size > 1 ? "s" : ""} com
              controle de SLA e lembretes.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleCopiarEmails}
              >
                <Copy className="size-3.5" />
                Copiar e-mails
              </Button>
              <Button size="sm" className="gap-2" onClick={handleRegistrar} disabled={registrando}>
                <Send className="size-3.5" />
                {registrando ? "Registrando…" : "Registrar cotações"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
