"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { toast } from "sonner";
import { Copy, Search, FileSpreadsheet, Filter } from "lucide-react";
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
import { VARIANT_CLASSES } from "@/lib/domain/status";
import { sugerirCandidatosParaObjeto } from "@/lib/actions/sugerirCandidatosCotacao";
import { adicionarCandidatoAPlanilha } from "@/lib/actions/candidatosCnpj";
import { aplicarSelecao } from "@/lib/domain/selecaoEmMassa";
import { PainelCnaes } from "./PainelCnaes";
import {
  REGIOES_BUSCA,
  type CandidatoSugerido,
  type RegiaoBuscaCandidatos,
} from "@/lib/domain/candidatoSugerido";
import { cn } from "@/lib/utils";

import { SELECT_CLASS as SELECT_BASE } from "@/components/common/selectClass";

const SELECT_CLASS = cn(SELECT_BASE, "w-full max-w-md");

export interface ProcessoOption {
  id: string;
  numero: string;
  objeto: string;
}

interface SelecaoFornecedoresFormProps {
  processos: ProcessoOption[];
}

export function SelecaoFornecedoresForm({ processos }: SelecaoFornecedoresFormProps) {
  const [processoId, setProcessoId] = useState("");
  const [candidatos, setCandidatos] = useState<CandidatoSugerido[] | null>(null);
  const [totalCandidatos, setTotalCandidatos] = useState(0);
  const [locaisCandidatos, setLocaisCandidatos] = useState(0);
  const [ocultadosPorSicaf, setOcultadosPorSicaf] = useState<number | null>(null);
  // E-mails que já voltaram numa cotação anterior ficam de fora; o analista pode reincluí-los.
  const [mostrarInvalidos, setMostrarInvalidos] = useState(false);
  const [ocultadosInvalidos, setOcultadosInvalidos] = useState(0);
  // Filtros do recorte da busca. Vazio = todas as regiões (comportamento anterior à expansão do
  // Sudeste); `somenteSicaf` é opt-in porque só ~3% das empresas com e-mail estão no SICAF.
  const [regioesSelecionadas, setRegioesSelecionadas] = useState<Set<RegiaoBuscaCandidatos>>(
    new Set(),
  );
  const [somenteSicaf, setSomenteSicaf] = useState(false);
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

  async function handleBuscarCandidatos(cnaesAprovados: string[]) {
    const processo = processos.find((p) => p.id === processoId);
    if (!processo) {
      toast.error("Selecione o processo primeiro — a busca usa o objeto dele.");
      return;
    }
    setBuscandoCandidatos(true);
    try {
      const r = await sugerirCandidatosParaObjeto(
        processo.objeto,
        processo.numero,
        cnaesAprovados,
        { regioes: [...regioesSelecionadas], somenteSicaf, mostrarInvalidos },
      );
      setCandidatos(r.candidatos);
      setTotalCandidatos(r.totalEncontrado);
      setLocaisCandidatos(r.locais);
      setOcultadosPorSicaf(r.ocultadosPorSicaf);
      setOcultadosInvalidos(r.ocultadosPorEmailInvalido);
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Processo</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Filtros ANTES do painel de CNAEs, porque é neste ponto que a busca é disparada — um
          recorte oferecido depois do resultado obrigaria a refazer a busca para ter efeito. */}
      {processoId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="size-4 text-muted-foreground" />
              Onde buscar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Região (nenhuma marcada = todas)
              </p>
              <div className="flex flex-wrap gap-3">
                {REGIOES_BUSCA.map((r) => (
                  <label key={r.valor} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={regioesSelecionadas.has(r.valor)}
                      onChange={() =>
                        setRegioesSelecionadas((prev) => {
                          const next = new Set(prev);
                          if (next.has(r.valor)) next.delete(r.valor);
                          else next.add(r.valor);
                          return next;
                        })
                      }
                    />
                    {r.rotulo}
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-1.5 border-t pt-3 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={somenteSicaf}
                onChange={(e) => setSomenteSicaf(e.target.checked)}
              />
              Somente empresas habilitadas no SICAF
              <span className="text-xs text-muted-foreground">
                (já licitam com o governo federal — bem menos empresas)
              </span>
            </label>

            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={mostrarInvalidos}
                onChange={(e) => setMostrarInvalidos(e.target.checked)}
              />
              Incluir e-mails que já voltaram
              <span className="text-xs text-muted-foreground">
                (endereço inexistente numa cotação anterior — enviar de novo costuma voltar de novo)
              </span>
            </label>
          </CardContent>
        </Card>
      )}

      {processoId && (
        <PainelCnaes
          objeto={processos.find((p) => p.id === processoId)?.objeto ?? ""}
          onAprovar={handleBuscarCandidatos}
          buscando={buscandoCandidatos}
        />
      )}

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
                  ? "Nenhuma da Baixada Santista nesta busca — a lista traz empresas de outras cidades/estados."
                  : `${locaisCandidatos} da Baixada Santista; as demais são de outras cidades.`}
              </p>
            )}
            {/* O custo do filtro precisa ficar visível: sem este aviso, uma lista curta é ambígua
                — o analista não sabe se a busca rendeu pouco ou se foi o filtro que estreitou. */}
            {ocultadosPorSicaf !== null && (
              <p className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-2 text-sm">
                Filtro do SICAF ligado: <strong>{candidatos.length}</strong> empresa(s) habilitada(s)
                nesta busca
                {ocultadosPorSicaf > 0 && (
                  <>
                    ; <strong>{ocultadosPorSicaf.toLocaleString("pt-BR")}</strong> ocultada(s) por
                    não estarem cadastradas no SICAF
                  </>
                )}
                . Desmarque o filtro acima para vê-las.
              </p>
            )}
            {ocultadosInvalidos > 0 && (
              <p className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
                <strong>{ocultadosInvalidos.toLocaleString("pt-BR")}</strong> e-mail(s) ocultado(s) por
                já terem voltado em cotações anteriores. Marque &quot;Incluir e-mails que já
                voltaram&quot; acima para vê-los.
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
                        <p className="text-sm font-medium break-words">
                          {c.razaoSocial}
                          {c.sicafHabilitado && (
                            <Badge
                              className={`${VARIANT_CLASSES.success} ml-1.5 align-middle`}
                              title="Habilitada a licitar no SICAF (compras.gov.br)"
                            >
                              SICAF
                            </Badge>
                          )}
                        </p>
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

    </div>
  );
}
