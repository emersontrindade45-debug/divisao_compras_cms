"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Mail, Users, Sparkles, Copy, Search, FileSpreadsheet } from "lucide-react";
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
import { sugerirCandidatosParaObjeto } from "@/lib/actions/sugerirCandidatosCotacao";
import { adicionarCandidatoAPlanilha } from "@/lib/actions/candidatosCnpj";
import { aplicarSelecao } from "@/lib/domain/selecaoEmMassa";
import type { CandidatoSugerido } from "@/lib/domain/candidatoSugerido";
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
  const [candidatos, setCandidatos] = useState<CandidatoSugerido[] | null>(null);
  const [totalCandidatos, setTotalCandidatos] = useState(0);
  const [locaisCandidatos, setLocaisCandidatos] = useState(0);
  const [buscandoCandidatos, setBuscandoCandidatos] = useState(false);
  const [candidatosSelecionados, setCandidatosSelecionados] = useState<Set<string>>(new Set());
  const [adicionandoPlanilha, setAdicionandoPlanilha] = useState(false);
  // Âncora do Shift: a linha a partir da qual o intervalo é medido (ver lib/domain/selecaoEmMassa).
  const [ancoraCandidatos, setAncoraCandidatos] = useState<string | null>(null);

  function handleCliqueCandidato(id: string, evento: ReactMouseEvent) {
    const ordemVisivel = (candidatos ?? []).map((c) => c.id);
    const { selecionados, ancora } = aplicarSelecao(
      candidatosSelecionados,
      ancoraCandidatos,
      id,
      ordemVisivel,
      { shift: evento.shiftKey, ctrl: evento.ctrlKey || evento.metaKey },
    );
    setCandidatosSelecionados(selecionados);
    setAncoraCandidatos(ancora);
  }

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

  async function handleBuscarCandidatos() {
    const processo = processos.find((p) => p.id === processoId);
    if (!processo) {
      toast.error("Selecione o processo primeiro — a busca usa o objeto dele.");
      return;
    }
    setBuscandoCandidatos(true);
    try {
      const r = await sugerirCandidatosParaObjeto(processo.objeto, processo.numero);
      setCandidatos(r.candidatos);
      setTotalCandidatos(r.totalEncontrado);
      setLocaisCandidatos(r.locais);
      // Nada vem pré-selecionado: a lista chega com até 500 empresas e marcar todas faria o
      // analista enviar cotação em massa sem revisar (§9.40 — a UI não pode prometer o que a
      // conferência da IN 65/2021 exige que seja conferido).
      setCandidatosSelecionados(new Set());
      if (r.candidatos.length === 0) {
        toast.warning(
          "Nenhuma empresa nova para este processo — as que casam com o objeto já estão na planilha.",
        );
      } else {
        toast.success(`${r.candidatos.length} empresa(s) encontrada(s). Revise e selecione.`);
      }
    } catch (erro) {
      // Mostra a causa real em vez de engolir a mensagem: sem isso, uma falha de conexão com o
      // banco de candidatos e um timeout ficam indistinguíveis para quem está na tela, e o
      // diagnóstico depende de ler log de servidor.
      const motivo = erro instanceof Error ? erro.message : String(erro);
      toast.error(`Não foi possível buscar empresas: ${motivo}`);
    } finally {
      setBuscandoCandidatos(false);
    }
  }

  async function handleAdicionarNaPlanilha() {
    const alvos = (candidatos ?? []).filter((c) => candidatosSelecionados.has(c.id));
    if (alvos.length === 0) {
      toast.error("Selecione ao menos uma empresa.");
      return;
    }
    // Número do processo em curso — vai para a coluna "Processos Cotação" de cada empresa.
    const numeroProcesso = processos.find((p) => p.id === processoId)?.numero;
    setAdicionandoPlanilha(true);
    try {
      // Sequencial de propósito: `adicionarCandidatoAPlanilha` faz append na planilha e deduplica
      // contra o que já está lá. Em paralelo, duas chamadas leriam a planilha antes de qualquer
      // uma escrever e ambas concluiriam que o CNPJ não existe — o mesmo modo de falha de
      // check-antes-de-escrever da §9.14, agora com o Sheets no lugar do banco.
      let adicionados = 0;
      let jaExistentes = 0;
      const falhas: string[] = [];
      for (const c of alvos) {
        const r = await adicionarCandidatoAPlanilha(c.id, numeroProcesso);
        if (r.error) falhas.push(`${c.razaoSocial}: ${r.error}`);
        else if (r.data?.jaExistente) jaExistentes++;
        else adicionados++;
      }

      const partes: string[] = [];
      if (adicionados > 0) partes.push(`${adicionados} adicionada(s) à planilha`);
      if (jaExistentes > 0) partes.push(`${jaExistentes} já estava(m) lá`);
      if (falhas.length > 0) partes.push(`${falhas.length} falhou(aram)`);
      const resumo = partes.join(", ");

      if (falhas.length === 0) toast.success(resumo);
      else if (adicionados > 0 || jaExistentes > 0) toast.warning(`${resumo}. ${falhas[0]}`);
      else toast.error(`Nenhuma adicionada. ${falhas[0]}`);
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      toast.error(`Falha ao adicionar na planilha: ${motivo}`);
    } finally {
      setAdicionandoPlanilha(false);
    }
  }

  async function handleCopiarEmailsCandidatos() {
    const emails = (candidatos ?? [])
      .filter((c) => candidatosSelecionados.has(c.id))
      .map((c) => c.email);
    if (emails.length === 0) {
      toast.error("Selecione ao menos uma empresa.");
      return;
    }
    await navigator.clipboard.writeText(emails.join("; "));
    toast.success(`${emails.length} e-mail(s) copiado(s).`);
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleBuscarCandidatos}
              disabled={buscandoCandidatos || !processoId}
            >
              <Search className="size-3.5" />
              {buscandoCandidatos ? "Buscando…" : "Buscar empresas na base"}
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
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-6" />
                <TableHead className="w-[38%]">Fornecedor</TableHead>
                <TableHead className="w-[27%]">Categorias</TableHead>
                <TableHead className="w-[15%]">Score</TableHead>
                <TableHead className="w-[20%] tabular-nums">Taxa de resposta</TableHead>
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
                    <TableCell className="whitespace-normal">
                      <div>
                        <p className="text-sm font-medium break-words">{f.razaoSocial}</p>
                        <p className="text-xs text-muted-foreground break-words">
                          {f.cidade}/{f.estado} · {f.responsavelContato}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap gap-1">
                        {f.categoria.slice(0, 2).map((c) => (
                          <Badge key={c} variant="secondary" className="max-w-full text-xs">
                            <span className="min-w-0 truncate">{c}</span>
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


      {candidatos !== null && candidatos.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="size-4 text-muted-foreground" />
              Empresas encontradas na base
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="tabular-nums">
                {candidatosSelecionados.size} de {candidatos.length}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleCopiarEmailsCandidatos}
              >
                <Copy className="size-3.5" />
                Copiar e-mails
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-2"
                onClick={handleAdicionarNaPlanilha}
                disabled={adicionandoPlanilha}
              >
                <FileSpreadsheet className="size-3.5" />
                {adicionandoPlanilha ? "Adicionando…" : "Adicionar à planilha"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="mb-3 text-sm text-muted-foreground">
              {totalCandidatos > candidatos.length
                ? `${totalCandidatos.toLocaleString("pt-BR")} empresas casaram com o objeto; mostrando as ${candidatos.length} mais relevantes (Baixada Santista primeiro).`
                : `${candidatos.length} empresa(s), Baixada Santista primeiro.`}{" "}
              Empresas já adicionadas neste processo não aparecem de novo — clique outra vez para
              buscar as próximas.
            </p>
            {locaisCandidatos < candidatos.length && (
              <p className="mb-3 text-sm">
                {locaisCandidatos === 0
                  ? "As empresas da Baixada Santista para este objeto já foram trabalhadas neste processo — a lista agora traz o restante do estado."
                  : `${locaisCandidatos} da Baixada Santista; as demais são de outras cidades de SP.`}
              </p>
            )}
            <p className="mb-3 text-xs text-muted-foreground">
              Clique para selecionar uma. <kbd className="rounded border px-1">Shift</kbd>+clique
              seleciona o intervalo desde a última;{" "}
              <kbd className="rounded border px-1">Ctrl</kbd>+clique marca ou desmarca sem perder o
              resto.
            </p>
            <div className="max-h-[28rem] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        className="accent-primary size-4 cursor-pointer"
                        aria-label="Selecionar todas as empresas da lista"
                        checked={
                          candidatos.length > 0 &&
                          candidatosSelecionados.size === candidatos.length
                        }
                        onChange={(evento) => {
                          setCandidatosSelecionados(
                            evento.target.checked
                              ? new Set(candidatos.map((c) => c.id))
                              : new Set(),
                          );
                          setAncoraCandidatos(null);
                        }}
                      />
                    </TableHead>
                    <TableHead className="w-[34%]">Empresa</TableHead>
                    <TableHead className="w-[18%]">Município</TableHead>
                    <TableHead className="w-[28%]">Atividade (CNAE)</TableHead>
                    <TableHead className="w-[20%]">E-mail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidatos.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer select-none"
                      data-state={candidatosSelecionados.has(c.id) ? "selected" : undefined}
                      onClick={(evento) => handleCliqueCandidato(c.id, evento)}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          readOnly
                          checked={candidatosSelecionados.has(c.id)}
                          className="accent-primary size-4 cursor-pointer"
                          aria-label={`Selecionar ${c.razaoSocial}`}
                        />
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <p className="text-sm font-medium break-words">{c.razaoSocial}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">{c.cnpj}</p>
                      </TableCell>
                      <TableCell className="whitespace-normal text-sm">
                        {c.municipio}/{c.estado}
                      </TableCell>
                      <TableCell className="whitespace-normal text-xs text-muted-foreground">
                        {c.cnaePrincipalDescricao}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <span className="text-xs break-all">{c.email}</span>
                        {c.emailCompartilhado && (
                          <Badge variant="secondary" className="ml-1 text-[0.65rem]">
                            compartilhado
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

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
