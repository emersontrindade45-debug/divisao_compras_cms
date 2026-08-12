/**
 * Roteiro de cálculo do valor de um candidato de similaridade (M21).
 *
 * Por que uma cadeia e não campos fixos: a forma como um órgão publica o preço
 * varia demais para caber numa conta só. Padronizar o valor de um contrato de
 * referência ao objeto do TR da Câmara pode exigir três passos ("valor global
 * ÷ metragem do contrato × metragem do TR × execuções no período") ou nenhum
 * ("o contrato já publica o preço unitário e o item é bem de consumo"). Um
 * roteiro de N passos cobre os dois extremos e todos os casos entre eles.
 *
 * O que sai daqui vira preço na estimativa e texto na instrução processual, e
 * por isso cada passo carrega DE ONDE veio o operando: sem isso a memória de
 * cálculo diz "× 940" onde deveria dizer "pela metragem do TR (940 m²)", e o
 * auditor não consegue refazer a conta (IN 65/2021).
 */

export const OPERACOES_PASSO = [
  "multiplicacao",
  "divisao",
  "soma",
  "subtracao",
  "acrescimo_percentual",
  "desconto_percentual",
] as const;
export type OperacaoPasso = (typeof OPERACOES_PASSO)[number];

/**
 * De onde o operando do passo vem.
 *
 * As origens `medida_tr`, `quantidade_tr` e `execucoes_periodo` NÃO carregam
 * número: são resolvidas a partir dos parâmetros do item (do TR). É isso que
 * faz o roteiro acompanhar sozinho uma correção na metragem ou na vigência, em
 * vez de exigir reedição candidato a candidato.
 */
export const ORIGENS_OPERANDO = [
  "livre",
  "quantidade_contrato",
  "medida_tr",
  "quantidade_tr",
  "execucoes_periodo",
] as const;
export type OrigemOperando = (typeof ORIGENS_OPERANDO)[number];

/** Origens cujo valor o analista digita; as demais vêm do item. */
export const ORIGENS_COM_VALOR: readonly OrigemOperando[] = ["livre", "quantidade_contrato"];

export interface PassoCalculo {
  operacao: OperacaoPasso;
  origem: OrigemOperando;
  /** Só para as origens de `ORIGENS_COM_VALOR` (e para os percentuais). */
  valor?: number | null;
  /** Descrição livre do operando, usada na memória de cálculo. */
  rotulo?: string | null;
}

export interface RoteiroCalculo {
  /** Valor de partida: o publicado pela fonte ou o corrigido pelo analista. */
  valorInicial: number;
  rotuloInicial?: string | null;
  /** Unidade de medida a que o valor inicial se refere (m², hora, posto...). */
  unidadeInicial?: string | null;
  passos: PassoCalculo[];
}

/**
 * Vigência do contrato de REFERÊNCIA — registro documental do candidato, não
 * entra em conta nenhuma. Não confundir com `Item.trVigenciaMeses`, que é a
 * vigência pretendida pela Câmara e essa sim multiplica.
 */
export const PERIODICIDADES_CONTRATO = [
  "mensal",
  "anual",
  "meses_12",
  "meses_18",
  "meses_24",
  "meses_30",
  "meses_36",
  "meses_48",
  "meses_60",
] as const;
export type PeriodicidadeContrato = (typeof PERIODICIDADES_CONTRATO)[number];

/**
 * Preço que vale para o candidato: o valor considerado quando há roteiro, senão
 * o original da fonte. Único ponto de decisão — promoção a Fonte, série de
 * preços e tela chamam esta função para não divergirem entre si.
 */
export function valorUnitarioEfetivo(candidato: {
  valorUnitario: number;
  valorConsiderado: number | null;
}): number {
  return candidato.valorConsiderado ?? candidato.valorUnitario;
}

export const FREQUENCIAS_EXECUCAO = [
  "unica",
  "mensal",
  "bimestral",
  "trimestral",
  "quadrimestral",
  "semestral",
  "anual",
] as const;
export type FrequenciaExecucao = (typeof FREQUENCIAS_EXECUCAO)[number];

const EXECUCOES_POR_ANO: Record<Exclude<FrequenciaExecucao, "unica">, number> = {
  mensal: 12,
  bimestral: 6,
  trimestral: 4,
  quadrimestral: 3,
  semestral: 2,
  anual: 1,
};

/** Parâmetros do objeto do TR da Câmara — vivem no Item, não no candidato. */
export interface ParametrosTR {
  /** Medida física do objeto (940 m²). Nula quando o item não tem medida. */
  medida: number | null;
  medidaUnidade: string | null;
  /** Quantidade do item como cadastrada no TR. */
  quantidade: number;
  unidade: string;
  frequencia: FrequenciaExecucao | null;
  vigenciaMeses: number | null;
}

/**
 * Quantas vezes o serviço será executado na vigência pretendida.
 *
 * Frequência única não multiplica pela vigência (uma reforma pontual num
 * contrato de 24 meses continua sendo uma reforma).
 */
export function calcularExecucoesNoPeriodo(
  frequencia: FrequenciaExecucao | null,
  vigenciaMeses: number | null,
): number | null {
  if (!frequencia) return null;
  if (frequencia === "unica") return 1;
  if (!vigenciaMeses || vigenciaMeses <= 0) return null;
  const porAno = EXECUCOES_POR_ANO[frequencia];
  return arredondar(porAno * (vigenciaMeses / 12), 4);
}

function arredondar(valor: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * f) / f;
}

/** Arredonda para centavos — o preço gravado é Decimal(12,2). */
function emCentavos(valor: number): number {
  return arredondar(valor, 2);
}

/**
 * Grandeza em que o resultado do roteiro está expresso. Derivada da cadeia, não
 * digitada: é o que permite dizer com precisão que dois candidatos do mesmo
 * item não são comparáveis (ver `grandezasDivergentes`).
 */
export const GRANDEZAS = ["unitario_contrato", "escopo_tr", "escopo_tr_periodo"] as const;
export type GrandezaResultado = (typeof GRANDEZAS)[number];

export function classificarGrandeza(passos: PassoCalculo[]): GrandezaResultado {
  if (passos.some((p) => p.origem === "execucoes_periodo")) return "escopo_tr_periodo";
  if (passos.some((p) => p.origem === "medida_tr" || p.origem === "quantidade_tr")) {
    return "escopo_tr";
  }
  return "unitario_contrato";
}

export const GRANDEZA_LABEL: Record<GrandezaResultado, string> = {
  unitario_contrato: "preço por unidade do contrato",
  escopo_tr: "valor do escopo do TR",
  escopo_tr_periodo: "valor do escopo do TR no período",
};

/**
 * Candidatos do mesmo item que terminam em grandezas diferentes não podem
 * entrar na mesma mediana — R$ 100,00/m² e R$ 25.906,40 pelo escopo em 24 meses
 * não são a mesma coisa. Não é bloqueio (a escolha é do analista e um item pode
 * ter um só candidato ajustado), mas a tela precisa dizer em voz alta.
 */
export function grandezasDivergentes(grandezas: Array<GrandezaResultado | null>): boolean {
  return new Set(grandezas.map((g) => g ?? "unitario_contrato")).size > 1;
}

// ---------------------------------------------------------------------------
// Execução do roteiro
// ---------------------------------------------------------------------------

export interface LinhaCalculo {
  /** Como o passo é lido em voz alta ("pela metragem do TR (940 m²)"). */
  descricao: string;
  operacao: OperacaoPasso;
  operando: number;
  /** Valor acumulado DEPOIS deste passo. */
  acumulado: number;
}

export type ResultadoRoteiro =
  | { ok: true; linhas: LinhaCalculo[]; valorFinal: number; grandeza: GrandezaResultado }
  | { ok: false; erro: string; passoComProblema: number | null };

const SIMBOLO: Record<OperacaoPasso, string> = {
  multiplicacao: "×",
  divisao: "÷",
  soma: "+",
  subtracao: "−",
  acrescimo_percentual: "+%",
  desconto_percentual: "−%",
};

export function simboloOperacao(operacao: OperacaoPasso): string {
  return SIMBOLO[operacao];
}

function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

/**
 * Resolve o operando de um passo, devolvendo o número e como ele deve ser lido.
 * Origem que depende do item falha explicitamente quando o parâmetro não foi
 * preenchido — devolver zero ou pular o passo produziria um preço errado em
 * silêncio, que é a falha que este módulo inteiro existe para evitar.
 */
function resolverOperando(
  passo: PassoCalculo,
  tr: ParametrosTR,
): { ok: true; valor: number; descricao: string } | { ok: false; erro: string } {
  switch (passo.origem) {
    case "livre":
    case "quantidade_contrato": {
      const valor = passo.valor;
      if (valor === null || valor === undefined || !Number.isFinite(valor)) {
        return { ok: false, erro: "Informe o número deste passo." };
      }
      const padrao =
        passo.origem === "quantidade_contrato"
          ? `pela quantidade contratada (${formatarNumero(valor)})`
          : `por ${formatarNumero(valor)}`;
      return {
        ok: true,
        valor,
        descricao: passo.rotulo ? `${passo.rotulo} (${formatarNumero(valor)})` : padrao,
      };
    }
    case "medida_tr": {
      if (tr.medida === null || !Number.isFinite(tr.medida)) {
        return {
          ok: false,
          erro: "Preencha a medida do objeto no TR (ex.: 940 m²) nos parâmetros do item.",
        };
      }
      const un = tr.medidaUnidade ? ` ${tr.medidaUnidade}` : "";
      return {
        ok: true,
        valor: tr.medida,
        descricao: `pela medida do objeto no TR (${formatarNumero(tr.medida)}${un})`,
      };
    }
    case "quantidade_tr":
      return {
        ok: true,
        valor: tr.quantidade,
        descricao: `pela quantidade do TR (${formatarNumero(tr.quantidade)} ${tr.unidade})`,
      };
    case "execucoes_periodo": {
      const execucoes = calcularExecucoesNoPeriodo(tr.frequencia, tr.vigenciaMeses);
      if (execucoes === null) {
        return {
          ok: false,
          erro: "Preencha a frequência e a vigência pretendida nos parâmetros do item.",
        };
      }
      return {
        ok: true,
        valor: execucoes,
        descricao: `pelas execuções no período (${formatarNumero(execucoes)})`,
      };
    }
  }
}

function aplicar(acumulado: number, operacao: OperacaoPasso, operando: number): number | null {
  switch (operacao) {
    case "multiplicacao":
      return acumulado * operando;
    case "divisao":
      return operando === 0 ? null : acumulado / operando;
    case "soma":
      return acumulado + operando;
    case "subtracao":
      return acumulado - operando;
    case "acrescimo_percentual":
      return acumulado * (1 + operando / 100);
    case "desconto_percentual":
      return acumulado * (1 - operando / 100);
  }
}

/**
 * Roda o roteiro passo a passo e devolve o valor final mais a linha de cada
 * etapa (para a prévia na tela e para a memória de cálculo).
 *
 * O arredondamento para centavos ocorre a cada passo: o valor que entra no
 * próximo passo é idêntico ao que é exibido na tela, eliminando discrepâncias
 * entre o resultado mostrado e o calculado.
 */
export function executarRoteiro(roteiro: RoteiroCalculo, tr: ParametrosTR): ResultadoRoteiro {
  if (!Number.isFinite(roteiro.valorInicial) || roteiro.valorInicial <= 0) {
    return { ok: false, erro: "Informe um valor de partida maior que zero.", passoComProblema: null };
  }

  let acumulado = roteiro.valorInicial;
  const linhas: LinhaCalculo[] = [];

  for (const [indice, passo] of roteiro.passos.entries()) {
    const operando = resolverOperando(passo, tr);
    if (!operando.ok) return { ok: false, erro: operando.erro, passoComProblema: indice };

    const proximo = aplicar(acumulado, passo.operacao, operando.valor);
    if (proximo === null || !Number.isFinite(proximo)) {
      return {
        ok: false,
        erro: "O passo não produziu um número válido (divisão por zero?).",
        passoComProblema: indice,
      };
    }

    acumulado = emCentavos(proximo);
    linhas.push({
      descricao: operando.descricao,
      operacao: passo.operacao,
      operando: operando.valor,
      acumulado,
    });
  }

  const valorFinal = emCentavos(acumulado);
  if (valorFinal <= 0) {
    return {
      ok: false,
      erro: "O roteiro resultou em valor zero ou negativo.",
      passoComProblema: null,
    };
  }
  // Decimal(12,2) no banco: 10 dígitos inteiros.
  if (valorFinal >= 10_000_000_000) {
    return {
      ok: false,
      erro: "O roteiro resultou em valor acima do limite gravável.",
      passoComProblema: null,
    };
  }

  return { ok: true, linhas, valorFinal, grandeza: classificarGrandeza(roteiro.passos) };
}
