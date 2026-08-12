"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eraser, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatarMoeda, paraCampo, parseNumeroBR } from "@/components/processos/parseNumeroBR";
import {
  GRANDEZA_LABEL,
  ORIGENS_COM_VALOR,
  executarRoteiro,
  simboloOperacao,
  type OperacaoPasso,
  type OrigemOperando,
  type ParametrosTR,
  type PassoCalculo,
  type PeriodicidadeContrato,
  type RoteiroCalculo,
} from "@/lib/domain/roteiroCalculo";
import { redigirMemoriaCalculo } from "@/lib/domain/memoriaCalculoCandidato";
import { limparRoteiroCalculo, salvarRoteiroCalculo } from "@/lib/actions/roteiroCalculo";

export const OPERACAO_LABEL: Record<OperacaoPasso, string> = {
  multiplicacao: "× multiplicado por",
  divisao: "÷ dividido por",
  soma: "+ somado a",
  subtracao: "− subtraído de",
  acrescimo_percentual: "+% acrescido de",
  desconto_percentual: "−% deduzido de",
};

/** Vigência do contrato de referência — documental (ver domain). */
export const PERIODICIDADE_LABEL: Record<PeriodicidadeContrato, string> = {
  mensal: "Mensal",
  anual: "Anual",
  meses_12: "12 meses",
  meses_18: "18 meses",
  meses_24: "24 meses",
  meses_30: "30 meses",
  meses_36: "36 meses",
  meses_48: "48 meses",
  meses_60: "60 meses",
};

const SEM_PERIODICIDADE = "sem_periodicidade";

export const ORIGEM_LABEL: Record<OrigemOperando, string> = {
  quantidade_contrato: "quantidade do contrato",
  medida_tr: "medida do objeto no TR",
  quantidade_tr: "quantidade do TR",
  execucoes_periodo: "execuções no período",
  livre: "outro número",
};

/**
 * Modelos prontos: as sequências que se repetem na Divisão de Compras. Aplicar
 * um deles monta a estrutura e deixa só os números para preencher — que é o que
 * padroniza dez candidatos de um item sem depender de lembrar a ordem.
 */
const MODELOS: Array<{ nome: string; descricao: string; passos: PassoCalculo[] }> = [
  {
    nome: "Contínuo — valor global",
    descricao: "valor global ÷ medida do contrato × medida do TR × execuções no período",
    passos: [
      { operacao: "divisao", origem: "quantidade_contrato", valor: null },
      { operacao: "multiplicacao", origem: "medida_tr" },
      { operacao: "multiplicacao", origem: "execucoes_periodo" },
    ],
  },
  {
    nome: "Contínuo — preço unitário",
    descricao: "preço unitário do contrato × medida do TR × execuções no período",
    passos: [
      { operacao: "multiplicacao", origem: "medida_tr" },
      { operacao: "multiplicacao", origem: "execucoes_periodo" },
    ],
  },
  {
    nome: "Consumo — × quantidade do TR",
    descricao: "preço unitário × quantidade do item no TR",
    passos: [{ operacao: "multiplicacao", origem: "quantidade_tr" }],
  },
  {
    nome: "Consumo — preço direto",
    descricao: "o preço unitário do contrato já é o comparável",
    passos: [],
  },
  {
    nome: "Obra/serviço com BDI",
    descricao: "preço × medida do TR + percentual de BDI",
    passos: [
      { operacao: "multiplicacao", origem: "medida_tr" },
      { operacao: "acrescimo_percentual", origem: "livre", valor: 22, rotulo: "BDI" },
    ],
  },
];

interface PassoEditavel {
  operacao: OperacaoPasso;
  origem: OrigemOperando;
  valor: string;
  rotulo: string;
  unidade: string;
}

function paraEditavel(passo: PassoCalculo): PassoEditavel {
  return {
    operacao: passo.operacao,
    origem: passo.origem,
    valor: paraCampo(passo.valor),
    rotulo: passo.rotulo ?? "",
    unidade: passo.unidade ?? "",
  };
}

/** Passo cujo operando o analista digita (origem livre ou qualquer percentual). */
function pedeNumero(passo: { operacao: OperacaoPasso; origem: OrigemOperando }): boolean {
  return (
    ORIGENS_COM_VALOR.includes(passo.origem) ||
    passo.operacao === "acrescimo_percentual" ||
    passo.operacao === "desconto_percentual"
  );
}

/** Unidade só faz sentido para um número digitado que representa uma medida — percentual não tem. */
function pedeUnidade(passo: { operacao: OperacaoPasso; origem: OrigemOperando }): boolean {
  return (
    ORIGENS_COM_VALOR.includes(passo.origem) &&
    passo.operacao !== "acrescimo_percentual" &&
    passo.operacao !== "desconto_percentual"
  );
}

export interface RoteiroCalculoEditorProps {
  resultadoId: string;
  valorPublicado: number;
  roteiroSalvo: RoteiroCalculo | null;
  tr: ParametrosTR;
  jaPromovido: boolean;
  candidato: { orgao: string; descricao: string; url: string | null; dataReferenciaISO: string };
  periodicidadeSalva: PeriodicidadeContrato | null;
  onFechar: () => void;
}

/**
 * Editor do roteiro de cálculo de um candidato (M21).
 *
 * A prévia roda o MESMO `executarRoteiro` do servidor — o que aparece na tela é
 * o que será gravado. O valor final nunca é enviado: a action reexecuta o
 * roteiro com os parâmetros do item lidos do banco.
 */
export function RoteiroCalculoEditor({
  resultadoId,
  valorPublicado,
  roteiroSalvo,
  tr,
  jaPromovido,
  candidato,
  periodicidadeSalva,
  onFechar,
}: RoteiroCalculoEditorProps) {
  const [valorInicial, setValorInicial] = useState(() =>
    paraCampo(roteiroSalvo?.valorInicial ?? valorPublicado),
  );
  const [rotuloInicial, setRotuloInicial] = useState(roteiroSalvo?.rotuloInicial ?? "");
  const [unidadeInicial, setUnidadeInicial] = useState(roteiroSalvo?.unidadeInicial ?? "");
  const [passos, setPassos] = useState<PassoEditavel[]>(
    () => roteiroSalvo?.passos.map(paraEditavel) ?? [],
  );
  const [periodicidade, setPeriodicidade] = useState<PeriodicidadeContrato | null>(
    periodicidadeSalva,
  );
  const [justificativaComplementar, setJustificativaComplementar] = useState(
    roteiroSalvo?.justificativaComplementar ?? "",
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const roteiro: RoteiroCalculo = {
    valorInicial: parseNumeroBR(valorInicial),
    rotuloInicial: rotuloInicial.trim() || null,
    unidadeInicial: unidadeInicial.trim() || null,
    passos: passos.map((p) => ({
      operacao: p.operacao,
      origem: p.origem,
      valor: pedeNumero(p) ? parseNumeroBR(p.valor) : null,
      rotulo: p.rotulo.trim() || null,
      unidade: pedeUnidade(p) ? p.unidade.trim() || null : null,
    })),
    justificativaComplementar: justificativaComplementar.trim() || null,
  };

  const previa = executarRoteiro(roteiro, tr);
  const memoria = previa.ok
    ? redigirMemoriaCalculo(roteiro, tr, {
        orgao: candidato.orgao,
        descricao: candidato.descricao,
        url: candidato.url,
        dataReferencia: new Date(candidato.dataReferenciaISO),
        vigenciaContrato: periodicidade ? PERIODICIDADE_LABEL[periodicidade] : null,
      })
    : null;

  function atualizarPasso(indice: number, mudanca: Partial<PassoEditavel>) {
    setPassos((atual) => atual.map((p, i) => (i === indice ? { ...p, ...mudanca } : p)));
  }

  function handleSalvar() {
    if (!previa.ok) {
      toast.error(previa.erro);
      return;
    }
    startTransition(async () => {
      const res = await salvarRoteiroCalculo({ resultadoId, roteiro, periodicidade });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        jaPromovido
          ? "Roteiro salvo e valor atualizado na série de preços."
          : "Roteiro salvo. O valor será usado ao promover o candidato para Fonte.",
      );
      router.refresh();
      onFechar();
    });
  }

  function handleLimpar() {
    startTransition(async () => {
      const res = await limparRoteiroCalculo(resultadoId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Roteiro removido. Vale de novo o valor publicado pela fonte.");
      router.refresh();
      onFechar();
    });
  }

  async function copiarMemoria() {
    if (!memoria) return;
    try {
      await navigator.clipboard.writeText(memoria);
      toast.success("Memória de cálculo copiada.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <div className="space-y-3 rounded-lg bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Modelos:</span>
        {MODELOS.map((modelo) => (
          <Button
            key={modelo.nome}
            size="sm"
            variant="outline"
            title={modelo.descricao}
            disabled={pending}
            onClick={() => setPassos(modelo.passos.map(paraEditavel))}
          >
            {modelo.nome}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Ponto de partida (publicado: {formatarMoeda(valorPublicado)})
          </span>
          <Input
            value={valorInicial}
            onChange={(e) => setValorInicial(e.target.value)}
            inputMode="decimal"
            aria-label="Valor de partida"
            className="w-36 font-mono tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">O que esse valor é</span>
          <Input
            value={rotuloInicial}
            onChange={(e) => setRotuloInicial(e.target.value)}
            placeholder="valor global do contrato"
            aria-label="Descrição do valor de partida"
            className="w-56"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Unidade</span>
          <Input
            value={unidadeInicial}
            onChange={(e) => setUnidadeInicial(e.target.value)}
            placeholder="m², hora…"
            aria-label="Unidade do valor de partida"
            className="w-28"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Vigência do contrato de referência
          </span>
          <Select
            value={periodicidade ?? SEM_PERIODICIDADE}
            onValueChange={(v) =>
              setPeriodicidade(
                v === SEM_PERIODICIDADE || v === null ? null : (v as PeriodicidadeContrato),
              )
            }
            disabled={pending}
          >
            <SelectTrigger
              size="sm"
              aria-label="Vigência do contrato de referência"
              className="w-40"
            >
              <SelectValue>
                {(v: string) =>
                  v === SEM_PERIODICIDADE
                    ? "Não informada"
                    : (PERIODICIDADE_LABEL[v as PeriodicidadeContrato] ?? v)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_PERIODICIDADE}>Não informada</SelectItem>
              {(Object.keys(PERIODICIDADE_LABEL) as PeriodicidadeContrato[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIODICIDADE_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="space-y-2">
        {passos.map((passo, indice) => {
          const comProblema = !previa.ok && previa.passoComProblema === indice;
          return (
            <div
              key={indice}
              className={`flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 ${
                comProblema ? "border-destructive" : "border-border"
              }`}
            >
              <span className="w-5 text-xs text-muted-foreground">{indice + 1}.</span>

              <Select
                value={passo.operacao}
                onValueChange={(v) => atualizarPasso(indice, { operacao: v as OperacaoPasso })}
                disabled={pending}
              >
                <SelectTrigger
                  size="sm"
                  aria-label={`Operação do passo ${indice + 1}`}
                  className="w-44"
                >
                  <SelectValue>
                    {(v: string) => OPERACAO_LABEL[v as OperacaoPasso] ?? v}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(OPERACAO_LABEL) as OperacaoPasso[]).map((op) => (
                    <SelectItem key={op} value={op}>
                      {OPERACAO_LABEL[op]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={passo.origem}
                onValueChange={(v) => atualizarPasso(indice, { origem: v as OrigemOperando })}
                disabled={pending}
              >
                <SelectTrigger
                  size="sm"
                  aria-label={`Operando do passo ${indice + 1}`}
                  className="w-52"
                >
                  <SelectValue>{(v: string) => ORIGEM_LABEL[v as OrigemOperando] ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ORIGEM_LABEL) as OrigemOperando[]).map((o) => (
                    <SelectItem key={o} value={o}>
                      {ORIGEM_LABEL[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {pedeNumero(passo) && (
                <Input
                  value={passo.valor}
                  onChange={(e) => atualizarPasso(indice, { valor: e.target.value })}
                  inputMode="decimal"
                  placeholder={
                    passo.operacao === "acrescimo_percentual" ||
                    passo.operacao === "desconto_percentual"
                      ? "22"
                      : "4.500"
                  }
                  aria-label={`Número do passo ${indice + 1}`}
                  className="w-28 font-mono tabular-nums"
                />
              )}

              {pedeUnidade(passo) && (
                <Input
                  value={passo.unidade}
                  onChange={(e) => atualizarPasso(indice, { unidade: e.target.value })}
                  placeholder="m², hora…"
                  aria-label={`Unidade do número do passo ${indice + 1}`}
                  className="w-24"
                />
              )}

              {passo.origem === "livre" && (
                <Input
                  value={passo.rotulo}
                  onChange={(e) => atualizarPasso(indice, { rotulo: e.target.value })}
                  placeholder="como chamar na memória de cálculo"
                  aria-label={`Rótulo do passo ${indice + 1}`}
                  className="w-64"
                />
              )}

              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remover passo ${indice + 1}`}
                disabled={pending}
                onClick={() => setPassos((atual) => atual.filter((_, i) => i !== indice))}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
          );
        })}

        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            setPassos((atual) => [
              ...atual,
              {
                operacao: "multiplicacao",
                origem: "quantidade_tr",
                valor: "",
                rotulo: "",
                unidade: "",
              },
            ])
          }
        >
          <Plus className="size-3.5" aria-hidden />
          Acrescentar passo
        </Button>
      </div>

      <label className="flex flex-col gap-1 border-t border-border pt-3">
        <span className="text-xs font-medium text-muted-foreground">
          Justificativa complementar (opcional) — some ao final da memória de cálculo
        </span>
        <Textarea
          value={justificativaComplementar}
          onChange={(e) => setJustificativaComplementar(e.target.value)}
          placeholder="Alguma ressalva ou explicação que os passos acima não cobrem."
          aria-label="Justificativa complementar"
          rows={2}
          className="text-sm"
        />
      </label>

      <div className="space-y-1 border-t border-border pt-3">
        <p className="text-xs font-medium text-muted-foreground">Prévia do cálculo</p>
        {previa.ok ? (
          <>
            <p className="font-mono text-sm tabular-nums">
              {formatarMoeda(roteiro.valorInicial)}
              {roteiro.unidadeInicial && (
                <span className="text-muted-foreground"> / {roteiro.unidadeInicial}</span>
              )}
              {roteiro.rotuloInicial && (
                <span className="font-sans text-xs text-muted-foreground">
                  {" "}
                  ({roteiro.rotuloInicial})
                </span>
              )}
            </p>
            {previa.linhas.map((linha, i) => (
              <p key={i} className="font-mono text-sm tabular-nums">
                <span className="text-muted-foreground"> {simboloOperacao(linha.operacao)} </span>
                <span className="font-sans text-xs text-muted-foreground">{linha.descricao}</span>
                {" = "}
                {formatarMoeda(linha.acumulado)}
              </p>
            ))}
            <p className="pt-1 font-mono text-base font-medium tabular-nums">
              {"➜ "}
              {formatarMoeda(previa.valorFinal)}
              <span className="font-sans text-xs font-normal text-muted-foreground">
                {" "}
                — {GRANDEZA_LABEL[previa.grandeza]}, é este o valor que entra na mediana
              </span>
            </p>
          </>
        ) : (
          <p className="text-sm text-destructive">{previa.erro}</p>
        )}
      </div>

      {memoria && (
        <div className="space-y-1 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Memória de cálculo (para a cota do processo)
            </p>
            <Button size="sm" variant="ghost" onClick={copiarMemoria}>
              <Copy className="size-3.5" aria-hidden />
              Copiar
            </Button>
          </div>
          <p className="rounded-md bg-background p-2 text-xs leading-relaxed ring-1 ring-border">
            {memoria}
          </p>
        </div>
      )}

      {jaPromovido && (
        <p className="text-xs text-muted-foreground">
          Este candidato já foi promovido — salvar atualiza também a Fonte e a série de preços
          (reconsolide a série depois).
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSalvar} disabled={pending || !previa.ok}>
          <Save className="size-3.5" aria-hidden />
          {pending ? "Salvando…" : "Salvar roteiro"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onFechar} disabled={pending}>
          Cancelar
        </Button>
        {roteiroSalvo && (
          <Button size="sm" variant="ghost" onClick={handleLimpar} disabled={pending}>
            <Eraser className="size-3.5" aria-hidden />
            Limpar roteiro
          </Button>
        )}
      </div>
    </div>
  );
}
