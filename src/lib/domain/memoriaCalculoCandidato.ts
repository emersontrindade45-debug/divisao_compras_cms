/**
 * Redação da memória de cálculo de um candidato (M21).
 *
 * A IN 65/2021 exige que a estimativa seja justificável: não basta o número
 * certo, é preciso conseguir explicar como se chegou nele. Este módulo traduz o
 * roteiro de cálculo em português corrido, para o analista colar na cota do
 * processo sem redigir do zero — e para o auditor refazer a conta lendo.
 *
 * Fica no domínio, e não num componente, porque o mesmo texto precisa aparecer
 * na tela e no PDF da memória de cálculo (CLAUDE.md §9.2).
 */

import {
  GRANDEZA_LABEL,
  calcularExecucoesNoPeriodo,
  executarRoteiro,
  type ParametrosTR,
  type RoteiroCalculo,
} from "./roteiroCalculo";

const FREQUENCIA_TEXTO: Record<string, string> = {
  unica: "execução única",
  mensal: "frequência mensal",
  bimestral: "frequência bimestral",
  trimestral: "frequência trimestral",
  quadrimestral: "frequência quadrimestral",
  semestral: "frequência semestral",
  anual: "frequência anual",
};

function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function numero(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

export interface IdentificacaoCandidato {
  orgao: string;
  descricao: string;
  url?: string | null;
  dataReferencia: Date;
  /** Vigência do contrato de REFERÊNCIA — não confundir com a do TR. */
  vigenciaContrato?: string | null;
}

/**
 * Monta o parágrafo da memória de cálculo. Devolve `null` quando o roteiro não
 * fecha: texto de justificativa para um cálculo que falhou seria pior que texto
 * nenhum.
 */
export function redigirMemoriaCalculo(
  roteiro: RoteiroCalculo,
  tr: ParametrosTR,
  candidato: IdentificacaoCandidato,
): string | null {
  const execucao = executarRoteiro(roteiro, tr);
  if (!execucao.ok) return null;

  const partes: string[] = [];

  const data = candidato.dataReferencia.toLocaleDateString("pt-BR");
  partes.push(
    `${candidato.orgao} — ${candidato.descricao} (referência de ${data}${
      candidato.url ? `, ${candidato.url}` : ""
    }).`,
  );

  const rotuloInicial = roteiro.rotuloInicial?.trim() || "valor publicado na fonte";
  const unidadeInicial = roteiro.unidadeInicial?.trim();
  partes.push(
    `Ponto de partida: ${moeda(roteiro.valorInicial)}${
      unidadeInicial ? ` por ${unidadeInicial}` : ""
    } (${rotuloInicial}).`,
  );

  if (candidato.vigenciaContrato) {
    partes.push(`Vigência do contrato de referência: ${candidato.vigenciaContrato}.`);
  }

  for (const linha of execucao.linhas) {
    const verbo = VERBO[linha.operacao];
    partes.push(`${verbo} ${linha.descricao}, resulta em ${moeda(linha.acumulado)}.`);
  }

  if (roteiro.passos.some((p) => p.origem === "execucoes_periodo")) {
    const execucoes = calcularExecucoesNoPeriodo(tr.frequencia, tr.vigenciaMeses);
    if (execucoes !== null && tr.frequencia) {
      const base =
        tr.frequencia === "unica"
          ? FREQUENCIA_TEXTO["unica"]
          : `${FREQUENCIA_TEXTO[tr.frequencia]} pela vigência pretendida de ${tr.vigenciaMeses} meses`;
      partes.push(`As execuções no período (${numero(execucoes)}) decorrem de ${base}.`);
    }
  }

  partes.push(
    `Valor considerado para a estimativa: ${moeda(execucao.valorFinal)} — ${
      GRANDEZA_LABEL[execucao.grandeza]
    }.`,
  );

  return partes.join(" ");
}

const VERBO: Record<string, string> = {
  multiplicacao: "Multiplicado",
  divisao: "Dividido",
  soma: "Acrescido",
  subtracao: "Subtraído",
  acrescimo_percentual: "Acrescido do percentual",
  desconto_percentual: "Deduzido do percentual",
};
