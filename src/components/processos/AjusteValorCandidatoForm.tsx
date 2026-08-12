"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eraser, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calcularValorProjetadoTR,
  calcularValorUnitarioAjustado,
  type BaseValorSerie,
  type OperacaoAjusteValor,
  type PeriodicidadeContrato,
} from "@/lib/domain/ajusteValorCandidato";
import {
  ajustarValorCandidato,
  limparAjusteValorCandidato,
} from "@/lib/actions/ajustarValorCandidato";

export const OPERACAO_LABEL: Record<OperacaoAjusteValor, string> = {
  divisao: "÷ dividido por",
  multiplicacao: "× multiplicado por",
  soma: "+ somado a",
};

export const PERIODICIDADE_LABEL: Record<PeriodicidadeContrato, string> = {
  mensal: "Mensal",
  anual: "Anual",
  meses_12: "12 meses",
  meses_18: "18 meses",
  meses_24: "24 meses",
  meses_36: "36 meses",
  meses_48: "48 meses",
  meses_60: "60 meses",
};

const SEM_PERIODICIDADE = "sem_periodicidade";

/**
 * Converte número digitado em pt-BR para `number`. `NaN` quando não dá para
 * ler com segurança — o chamador trata como campo inválido em vez de mandar
 * lixo para a server action.
 *
 * O caso perigoso é "15.000": `Number("15.000")` devolve 15, e um contrato de
 * quinze mil viraria quinze reais na série de preços sem nenhum aviso. Por isso
 * o ponto só é lido como decimal quando o texto NÃO tem cara de milhar.
 */
export function parseNumeroBR(bruto: string): number {
  const s = bruto
    .trim()
    .replace(/r\$/gi, "")
    .replace(/\s| /g, "");
  if (!s) return Number.NaN;
  if (!/^-?[\d.,]+$/.test(s)) return Number.NaN;

  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");

  let normalizado = s;
  if (temVirgula && temPonto) {
    // "15.000,50" — ponto é milhar, vírgula é decimal.
    normalizado = s.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    normalizado = s.replace(",", ".");
  } else if (temPonto && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // "15.000" / "1.200.000" — grupos de 3: milhar, não decimal.
    normalizado = s.replace(/\./g, "");
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : Number.NaN;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Número para dentro do input: sem separador de milhar, vírgula decimal. */
function paraCampo(valor: number | null): string {
  if (valor === null) return "";
  return String(valor).replace(".", ",");
}

export interface AjusteCandidatoProps {
  resultadoId: string;
  /** Valor como a fonte pública publicou — base inicial do cálculo. */
  valorUnitarioOriginal: number;
  ajusteValorBase: number | null;
  ajusteOperacao: OperacaoAjusteValor | null;
  ajusteQuantidade: number | null;
  ajusteUnidadeMedida: string | null;
  ajusteQuantidadeTR: number | null;
  ajustePeriodicidade: PeriodicidadeContrato | null;
  ajusteBaseSerie: BaseValorSerie | null;
  temAjuste: boolean;
  /** Quantidade do item no TR da Câmara — pré-preenche a projeção. */
  quantidadeItemTR: number;
  unidadeItemTR: string;
  jaPromovido: boolean;
  onFechar: () => void;
}

/**
 * Painel de correção do preço de um candidato (M20).
 *
 * O valor que a fonte publica frequentemente é o contrato inteiro, não o preço
 * por unidade; aqui o analista refaz a conta e o resultado passa a ser o preço
 * que entra na estimativa. Os operandos ficam gravados para o auditor conferir.
 */
export function AjusteValorCandidatoForm({
  resultadoId,
  valorUnitarioOriginal,
  ajusteValorBase,
  ajusteOperacao,
  ajusteQuantidade,
  ajusteUnidadeMedida,
  ajusteQuantidadeTR,
  ajustePeriodicidade,
  ajusteBaseSerie,
  temAjuste,
  quantidadeItemTR,
  unidadeItemTR,
  jaPromovido,
  onFechar,
}: AjusteCandidatoProps) {
  const [valorBase, setValorBase] = useState(() =>
    paraCampo(ajusteValorBase ?? valorUnitarioOriginal),
  );
  const [operacao, setOperacao] = useState<OperacaoAjusteValor>(ajusteOperacao ?? "divisao");
  const [quantidade, setQuantidade] = useState(() => paraCampo(ajusteQuantidade));
  const [unidadeMedida, setUnidadeMedida] = useState(ajusteUnidadeMedida ?? "");
  const [quantidadeTR, setQuantidadeTR] = useState(() =>
    paraCampo(ajusteQuantidadeTR ?? quantidadeItemTR),
  );
  const [periodicidade, setPeriodicidade] = useState<PeriodicidadeContrato | null>(
    ajustePeriodicidade,
  );
  const [baseSerie, setBaseSerie] = useState<BaseValorSerie>(ajusteBaseSerie ?? "unitario");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const valorBaseNum = parseNumeroBR(valorBase);
  const quantidadeNum = parseNumeroBR(quantidade);
  const quantidadeTRNum = parseNumeroBR(quantidadeTR);

  const previa = calcularValorUnitarioAjustado({
    valorBase: valorBaseNum,
    operacao,
    quantidade: quantidadeNum,
  });
  const projetado = previa.ok
    ? calcularValorProjetadoTR(
        previa.valorUnitario,
        Number.isNaN(quantidadeTRNum) ? null : quantidadeTRNum,
      )
    : null;

  // Escolher a projeção sem quantidade de TR válida não tem resultado — o botão
  // fica travado em vez de deixar o erro só aparecer depois de ir ao servidor.
  const podeSalvar = previa.ok && (baseSerie === "unitario" || projetado !== null);

  function handleSalvar() {
    if (!previa.ok) {
      toast.error(previa.erro);
      return;
    }
    if (baseSerie === "projetado_tr" && projetado === null) {
      toast.error("Informe a quantidade do TR para usar o valor projetado na mediana.");
      return;
    }
    startTransition(async () => {
      const res = await ajustarValorCandidato({
        resultadoId,
        valorBase: valorBaseNum,
        operacao,
        quantidade: quantidadeNum,
        unidadeMedida: unidadeMedida.trim() || null,
        quantidadeTR: Number.isNaN(quantidadeTRNum) || quantidadeTRNum <= 0 ? null : quantidadeTRNum,
        periodicidade,
        baseSerie,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        jaPromovido
          ? "Valor ajustado e atualizado na série de preços."
          : "Valor ajustado. Ele será usado ao promover o candidato para Fonte.",
      );
      router.refresh();
      onFechar();
    });
  }

  function handleLimpar() {
    startTransition(async () => {
      const res = await limparAjusteValorCandidato(resultadoId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Ajuste removido. Vale de novo o valor publicado pela fonte.");
      router.refresh();
      onFechar();
    });
  }

  return (
    <div className="space-y-3 rounded-lg bg-muted/40 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Campo
          label="Valor do contrato"
          hint={`publicado: ${formatarMoeda(valorUnitarioOriginal)}`}
        >
          <Input
            value={valorBase}
            onChange={(e) => setValorBase(e.target.value)}
            inputMode="decimal"
            aria-label="Valor do contrato"
            className="w-36 font-mono tabular-nums"
          />
        </Campo>

        <Campo label="Operação">
          <Select
            value={operacao}
            onValueChange={(v) => setOperacao(v as OperacaoAjusteValor)}
            disabled={pending}
          >
            <SelectTrigger size="sm" aria-label="Operação do cálculo" className="w-44">
              <SelectValue>
                {(v: string) => OPERACAO_LABEL[v as OperacaoAjusteValor] ?? v}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="divisao">{OPERACAO_LABEL.divisao}</SelectItem>
              <SelectItem value="multiplicacao">{OPERACAO_LABEL.multiplicacao}</SelectItem>
              <SelectItem value="soma">{OPERACAO_LABEL.soma}</SelectItem>
            </SelectContent>
          </Select>
        </Campo>

        <Campo label="Quantidade do contrato">
          <Input
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            inputMode="decimal"
            placeholder="150"
            aria-label="Quantidade do contrato"
            className="w-28 font-mono tabular-nums"
          />
        </Campo>

        <Campo label="Unidade de medida">
          <Input
            value={unidadeMedida}
            onChange={(e) => setUnidadeMedida(e.target.value)}
            placeholder="m², m, serviço…"
            aria-label="Unidade de medida"
            className="w-36"
          />
        </Campo>

        <Campo label="Vigência do contrato">
          <Select
            value={periodicidade ?? SEM_PERIODICIDADE}
            onValueChange={(v) =>
              setPeriodicidade(
                v === SEM_PERIODICIDADE || v === null ? null : (v as PeriodicidadeContrato),
              )
            }
            disabled={pending}
          >
            <SelectTrigger size="sm" aria-label="Vigência do contrato" className="w-36">
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
        </Campo>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-medium text-muted-foreground">
          Qual valor entra na mediana da série
        </p>
        <div className="flex flex-wrap gap-2">
          <OpcaoValor
            selecionada={baseSerie === "unitario"}
            onSelecionar={() => setBaseSerie("unitario")}
            rotulo="Valor unitário"
            descricao="resultado do cálculo acima"
            aria-label="Usar o valor unitário na mediana"
          >
            {previa.ok ? (
              <>
                {formatarMoeda(previa.valorUnitario)}
                {unidadeMedida.trim() && (
                  <span className="text-muted-foreground"> / {unidadeMedida.trim()}</span>
                )}
              </>
            ) : (
              <span className="text-sm font-normal text-destructive">{previa.erro}</span>
            )}
          </OpcaoValor>

          <OpcaoValor
            selecionada={baseSerie === "projetado_tr"}
            onSelecionar={() => setBaseSerie("projetado_tr")}
            rotulo="Valor projetado para o TR"
            descricao={`unitário x quantidade do TR (${quantidadeItemTR} ${unidadeItemTR})`}
            aria-label="Usar o valor projetado para o TR na mediana"
          >
            {projetado === null ? <span className="text-muted-foreground">—</span> : formatarMoeda(projetado)}
          </OpcaoValor>
        </div>

        <label className="flex items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">Quantidade do TR</span>
          <Input
            value={quantidadeTR}
            onChange={(e) => setQuantidadeTR(e.target.value)}
            inputMode="decimal"
            aria-label="Quantidade do TR da Câmara"
            className="w-24 font-mono tabular-nums"
          />
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        Os candidatos de um mesmo item precisam entrar pela mesma base — misturar preço unitário
        com valor do escopo inteiro produz mediana sem significado.
        {jaPromovido &&
          " Este candidato já foi promovido — salvar atualiza também a Fonte e a série de preços (reconsolide a série depois)."}
      </p>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSalvar} disabled={pending || !podeSalvar}>
          <Save className="size-3.5" aria-hidden />
          {pending ? "Salvando…" : "Salvar ajuste"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onFechar} disabled={pending}>
          Cancelar
        </Button>
        {temAjuste && (
          <Button size="sm" variant="ghost" onClick={handleLimpar} disabled={pending}>
            <Eraser className="size-3.5" aria-hidden />
            Limpar ajuste
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Cartão selecionável com um dos dois valores candidatos à mediana. É um
 * `radio` de verdade (não um botão qualquer) para que teclado e leitor de tela
 * entendam que os dois são exclusivos entre si.
 */
function OpcaoValor({
  selecionada,
  onSelecionar,
  rotulo,
  descricao,
  children,
  ...props
}: {
  selecionada: boolean;
  onSelecionar: () => void;
  rotulo: string;
  descricao: string;
  children: React.ReactNode;
} & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selecionada}
      onClick={onSelecionar}
      className={cn(
        "flex min-w-56 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
        selecionada
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border hover:bg-muted/60",
      )}
      {...props}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium">
        {selecionada && <Check className="size-3 text-primary" aria-hidden />}
        {rotulo}
      </span>
      <span className="font-mono text-base font-medium tabular-nums">{children}</span>
      <span className="text-xs text-muted-foreground">{descricao}</span>
    </button>
  );
}

function Campo({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {hint && <span className="ml-1 font-normal">({hint})</span>}
      </span>
      {children}
    </label>
  );
}
