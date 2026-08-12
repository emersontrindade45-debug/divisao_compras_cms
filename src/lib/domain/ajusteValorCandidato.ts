/**
 * Ajuste manual do valor de um candidato de similaridade (M20).
 *
 * Por que existe: o valor que a fonte pública devolve nem sempre é o preço por
 * unidade. No PNCP é comum o contrato inteiro aparecer como "valor unitário" —
 * R$ 15.000,00 para lavar 150 m² entra como R$ 15.000,00 e, se promovido assim,
 * infla a série de preços em 150x. A correção é do analista (ele abre o
 * contrato e lê a quantidade real), mas o CÁLCULO é regra de domínio: o número
 * que sai daqui vira preço na estimativa e precisa ser reproduzível pelo
 * auditor a partir dos operandos gravados (IN 65/2021 — memória de cálculo).
 *
 * Nada aqui converte periodicidade: um contrato mensal e um anual entram na
 * série pelo seu próprio unitário, e a vigência é registro documental.
 */

export const OPERACOES_AJUSTE = ["divisao", "multiplicacao", "soma"] as const;
export type OperacaoAjusteValor = (typeof OPERACOES_AJUSTE)[number];

export const PERIODICIDADES_CONTRATO = [
  "mensal",
  "anual",
  "meses_12",
  "meses_18",
  "meses_24",
  "meses_36",
  "meses_48",
  "meses_60",
] as const;
export type PeriodicidadeContrato = (typeof PERIODICIDADES_CONTRATO)[number];

export interface EntradaAjusteValor {
  /** Valor como a fonte publicou (ou como o analista corrigiu à mão). */
  valorBase: number;
  operacao: OperacaoAjusteValor;
  /** Operando: quase sempre a quantidade contratada no contrato de referência. */
  quantidade: number;
}

export type ResultadoAjusteValor =
  | { ok: true; valorUnitario: number }
  | { ok: false; erro: string };

/** Arredonda para centavos — o preço gravado é Decimal(12,2). */
function emCentavos(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Aplica a operação escolhida e devolve o preço unitário comparável.
 *
 * Rejeita resultado não-positivo em vez de gravar zero: preço zerado passaria
 * silenciosamente para a mediana e distorceria a estimativa sem nenhum sinal na
 * tela.
 */
export function calcularValorUnitarioAjustado({
  valorBase,
  operacao,
  quantidade,
}: EntradaAjusteValor): ResultadoAjusteValor {
  if (!Number.isFinite(valorBase) || valorBase <= 0) {
    return { ok: false, erro: "Informe um valor de contrato maior que zero." };
  }
  if (!Number.isFinite(quantidade)) {
    return { ok: false, erro: "Informe uma quantidade numérica." };
  }
  // Divisão e multiplicação por quantidade não-positiva não têm leitura de
  // negócio (não existe contrato de 0 m²); a soma aceita negativo porque serve
  // para abater um valor fixo do total publicado.
  if (operacao !== "soma" && quantidade <= 0) {
    return { ok: false, erro: "Informe uma quantidade maior que zero." };
  }

  const bruto =
    operacao === "divisao"
      ? valorBase / quantidade
      : operacao === "multiplicacao"
        ? valorBase * quantidade
        : valorBase + quantidade;

  if (!Number.isFinite(bruto)) {
    return { ok: false, erro: "O cálculo não produziu um número válido." };
  }

  const valorUnitario = emCentavos(bruto);
  if (valorUnitario <= 0) {
    return { ok: false, erro: "O cálculo resultou em valor zero ou negativo." };
  }
  // Decimal(12,2) no banco: 10 dígitos inteiros.
  if (valorUnitario >= 10_000_000_000) {
    return { ok: false, erro: "O cálculo resultou em valor acima do limite gravável." };
  }

  return { ok: true, valorUnitario };
}

/**
 * Projeção do custo do objeto da Câmara: resultado do cálculo x quantidade do
 * TR.
 */
export function calcularValorProjetadoTR(
  valorUnitario: number,
  quantidadeTR: number | null | undefined,
): number | null {
  if (quantidadeTR === null || quantidadeTR === undefined) return null;
  if (!Number.isFinite(valorUnitario) || !Number.isFinite(quantidadeTR)) return null;
  if (quantidadeTR <= 0) return null;
  return emCentavos(valorUnitario * quantidadeTR);
}

/**
 * Qual dos dois números o analista escolheu levar para a série de preços:
 * o resultado direto do cálculo (`unitario`) ou ele já multiplicado pela
 * quantidade do TR (`projetado_tr`).
 *
 * A escolha existe porque a forma como o contrato de referência é publicado
 * varia: às vezes o comparável é o preço por unidade, às vezes é o custo do
 * escopo inteiro. Quem lê o contrato é quem sabe — ver a advertência de
 * `basesDivergentes` sobre misturar os dois no mesmo item.
 */
export const BASES_VALOR_SERIE = ["unitario", "projetado_tr"] as const;
export type BaseValorSerie = (typeof BASES_VALOR_SERIE)[number];

export type ResultadoValorConsiderado =
  | { ok: true; valor: number }
  | { ok: false; erro: string };

/** Aplica a escolha da base e devolve o valor que vai para a série. */
export function calcularValorConsiderado({
  valorUnitario,
  base,
  quantidadeTR,
}: {
  valorUnitario: number;
  base: BaseValorSerie;
  quantidadeTR: number | null;
}): ResultadoValorConsiderado {
  if (base === "unitario") return { ok: true, valor: valorUnitario };

  const projetado = calcularValorProjetadoTR(valorUnitario, quantidadeTR);
  if (projetado === null) {
    return {
      ok: false,
      erro: "Informe a quantidade do TR para usar o valor projetado na mediana.",
    };
  }
  if (projetado >= 10_000_000_000) {
    return { ok: false, erro: "O valor projetado passa do limite gravável." };
  }
  return { ok: true, valor: projetado };
}

/**
 * Preço que vale para o candidato: o valor considerado quando há ajuste, senão
 * o original da fonte. Único ponto de decisão — promoção a Fonte, série de
 * preços e tela chamam esta função para não divergirem entre si.
 */
export function valorUnitarioEfetivo(candidato: {
  valorUnitario: number;
  valorConsiderado: number | null;
}): number {
  return candidato.valorConsiderado ?? candidato.valorUnitario;
}

/**
 * Um item cujos candidatos entram na série com bases diferentes tem mediana sem
 * significado: R$ 100,00/m² e R$ 187.650,00 pelo escopo inteiro não são a mesma
 * grandeza. Não é bloqueio — a escolha é do analista, e há casos legítimos de
 * item com um só candidato ajustado — mas a tela precisa dizer em voz alta.
 */
export function basesDivergentes(
  candidatos: Array<{ ajusteBaseSerie: BaseValorSerie | null }>,
): boolean {
  const bases = new Set(candidatos.map((c) => c.ajusteBaseSerie ?? "unitario"));
  return bases.size > 1;
}
