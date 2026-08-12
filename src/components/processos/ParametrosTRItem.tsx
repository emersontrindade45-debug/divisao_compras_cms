"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ruler, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseNumeroBR } from "@/components/processos/parseNumeroBR";
import {
  calcularExecucoesNoPeriodo,
  type FrequenciaExecucao,
} from "@/lib/domain/roteiroCalculo";
import { salvarParametrosTR } from "@/lib/actions/roteiroCalculo";

export const FREQUENCIA_LABEL: Record<FrequenciaExecucao, string> = {
  unica: "Execução única",
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  quadrimestral: "Quadrimestral",
  semestral: "Semestral",
  anual: "Anual",
};

const SEM_FREQUENCIA = "sem_frequencia";
const VIGENCIAS_COMUNS = [12, 18, 24, 30, 36, 48, 60];

export interface ParametrosTRProps {
  itemId: string;
  quantidade: number;
  unidade: string;
  trMedida: number | null;
  trMedidaUnidade: string | null;
  trFrequencia: FrequenciaExecucao | null;
  trVigenciaMeses: number | null;
}

/**
 * Parâmetros do objeto no TR da Câmara — valem para TODOS os candidatos do
 * item. Ficam aqui, no cabeçalho do item, e não dentro do ajuste de cada
 * candidato, porque são o mesmo número para todos: repetir por candidato só
 * criaria a chance de dois deles usarem metragens diferentes.
 */
export function ParametrosTRItem(props: ParametrosTRProps) {
  const [aberto, setAberto] = useState(false);

  const execucoes = calcularExecucoesNoPeriodo(props.trFrequencia, props.trVigenciaMeses);
  const resumo: string[] = [];
  if (props.trMedida !== null) {
    resumo.push(
      `${props.trMedida.toLocaleString("pt-BR")}${props.trMedidaUnidade ? ` ${props.trMedidaUnidade}` : ""}`,
    );
  }
  if (execucoes !== null) resumo.push(`${execucoes.toLocaleString("pt-BR")} execuções`);

  return (
    <div>
      <Button
        size="sm"
        variant={resumo.length > 0 ? "secondary" : "outline"}
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        <Ruler className="size-3.5" aria-hidden />
        {resumo.length > 0 ? `TR: ${resumo.join(" · ")}` : "Parâmetros do TR"}
      </Button>
      {aberto && <FormularioParametros {...props} onFechar={() => setAberto(false)} />}
    </div>
  );
}

function FormularioParametros({
  itemId,
  quantidade,
  unidade,
  trMedida,
  trMedidaUnidade,
  trFrequencia,
  trVigenciaMeses,
  onFechar,
}: ParametrosTRProps & { onFechar: () => void }) {
  const [medida, setMedida] = useState(trMedida === null ? "" : String(trMedida).replace(".", ","));
  const [medidaUnidade, setMedidaUnidade] = useState(trMedidaUnidade ?? "");
  const [frequencia, setFrequencia] = useState<FrequenciaExecucao | null>(trFrequencia);
  const [vigencia, setVigencia] = useState(trVigenciaMeses === null ? "" : String(trVigenciaMeses));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const medidaNum = parseNumeroBR(medida);
  const vigenciaNum = parseNumeroBR(vigencia);
  const execucoes = calcularExecucoesNoPeriodo(
    frequencia,
    Number.isNaN(vigenciaNum) ? null : vigenciaNum,
  );

  function handleSalvar() {
    startTransition(async () => {
      const res = await salvarParametrosTR({
        itemId,
        medida: Number.isNaN(medidaNum) || medidaNum <= 0 ? null : medidaNum,
        medidaUnidade: medidaUnidade.trim() || null,
        frequencia,
        vigenciaMeses:
          Number.isNaN(vigenciaNum) || vigenciaNum <= 0 ? null : Math.round(vigenciaNum),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Parâmetros do TR salvos. Os cálculos deste item foram atualizados.");
      router.refresh();
      onFechar();
    });
  }

  return (
    <div className="mt-2 w-[28rem] space-y-3 rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">
        Valem para todos os candidatos deste item. A quantidade cadastrada no TR é{" "}
        <strong>
          {quantidade} {unidade}
        </strong>
        .
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Medida do objeto</span>
          <Input
            value={medida}
            onChange={(e) => setMedida(e.target.value)}
            inputMode="decimal"
            placeholder="940"
            aria-label="Medida do objeto no TR"
            className="w-28 font-mono tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Unidade da medida</span>
          <Input
            value={medidaUnidade}
            onChange={(e) => setMedidaUnidade(e.target.value)}
            placeholder="m², m, hora…"
            aria-label="Unidade da medida do TR"
            className="w-32"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Frequência de execução</span>
          <Select
            value={frequencia ?? SEM_FREQUENCIA}
            onValueChange={(v) =>
              setFrequencia(
                v === SEM_FREQUENCIA || v === null ? null : (v as FrequenciaExecucao),
              )
            }
            disabled={pending}
          >
            <SelectTrigger size="sm" aria-label="Frequência de execução" className="w-40">
              <SelectValue>
                {(v: string) =>
                  v === SEM_FREQUENCIA
                    ? "Não informada"
                    : (FREQUENCIA_LABEL[v as FrequenciaExecucao] ?? v)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_FREQUENCIA}>Não informada</SelectItem>
              {(Object.keys(FREQUENCIA_LABEL) as FrequenciaExecucao[]).map((f) => (
                <SelectItem key={f} value={f}>
                  {FREQUENCIA_LABEL[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Vigência pretendida (meses)
          </span>
          <Input
            value={vigencia}
            onChange={(e) => setVigencia(e.target.value)}
            inputMode="numeric"
            list={`vigencias-${itemId}`}
            placeholder="24"
            aria-label="Vigência pretendida em meses"
            className="w-24 font-mono tabular-nums"
          />
          <datalist id={`vigencias-${itemId}`}>
            {VIGENCIAS_COMUNS.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        {execucoes === null ? (
          "Informe frequência e vigência para o cálculo saber quantas execuções considerar."
        ) : (
          <>
            Execuções no período:{" "}
            <strong className="font-mono tabular-nums">
              {execucoes.toLocaleString("pt-BR")}
            </strong>
            . Esta é a vigência que a Câmara pretende contratar — não a do contrato de referência.
          </>
        )}
      </p>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSalvar} disabled={pending}>
          <Save className="size-3.5" aria-hidden />
          {pending ? "Salvando…" : "Salvar parâmetros"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onFechar} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
