/**
 * Camada de DESEMPENHO do dashboard (M30.b) — as métricas de sucesso do PRD
 * que o dado já existente sustenta. Pura: recebe agregados e a janela.
 *
 * Regra de toda função aqui: devolver o valor JUNTO com a cobertura (sobre
 * quantos casos ele foi calculado e quantos ficaram de fora). Um número limpo
 * calculado sobre uma base suja é pior que nenhum (CLAUDE.md §9.85).
 */
import { SERIE_MINIMA_PRECOS } from "./marcos";

export type Periodo = "30d" | "90d" | "12m";

export const PERIODOS: Periodo[] = ["30d", "90d", "12m"];
export const PERIODO_PADRAO: Periodo = "90d";

export const PERIODO_LABEL: Record<Periodo, string> = {
  "30d": "30 dias",
  "90d": "90 dias",
  "12m": "12 meses",
};

const DIA_MS = 24 * 60 * 60 * 1000;
const DURACAO_DIAS: Record<Periodo, number> = { "30d": 30, "90d": 90, "12m": 365 };

export interface Janela {
  inicio: Date;
  fim: Date;
}

export function lerPeriodo(valor: string | undefined): Periodo {
  return PERIODOS.includes(valor as Periodo) ? (valor as Periodo) : PERIODO_PADRAO;
}

/** Janela atual `[agora − duração, agora)` e a anterior, de mesmo tamanho. */
export function janelas(periodo: Periodo, agora: Date): { atual: Janela; anterior: Janela } {
  const dur = DURACAO_DIAS[periodo] * DIA_MS;
  const inicio = new Date(agora.getTime() - dur);
  return {
    atual: { inicio, fim: agora },
    anterior: { inicio: new Date(inicio.getTime() - dur), fim: inicio },
  };
}

export function dentro(data: Date | null, j: Janela): data is Date {
  return data !== null && data >= j.inicio && data < j.fim;
}

export interface Indicador {
  /** null quando não há caso nenhum para calcular. */
  valor: number | null;
  /** Casos que entraram na conta. */
  base: number;
  /** Casos do universo que ficaram fora (ex.: data não confiável). */
  excluidos: number;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
}

function percentual(parte: number, todo: number): number | null {
  return todo > 0 ? Math.round((parte / todo) * 100) : null;
}

// ── Tempo até marco ───────────────────────────────────────────────────────

export interface ProcessoTempoInput {
  dataAbertura: Date;
  dataAberturaOrigem: "informada" | "importacao";
  marcosIncertos: boolean;
  primeiraReferenciaEm: Date | null;
  serieMinimaEm: Date | null;
}

/** Só conta tempo quem tem data de abertura confirmada e marcos de quando aconteceram. */
export function temTempoConfiavel(p: ProcessoTempoInput): boolean {
  return p.dataAberturaOrigem === "informada" && !p.marcosIncertos;
}

/**
 * Mediana, em dias, de `dataAbertura → marco`, para os processos cujo MARCO
 * caiu na janela (por evento, não por coorte de abertura: um processo aberto
 * ontem ainda não teve chance de atingir o marco e distorceria a média).
 */
export function tempoAteMarco(
  processos: ProcessoTempoInput[],
  marco: "primeiraReferenciaEm" | "serieMinimaEm",
  j: Janela,
): Indicador {
  const noPeriodo = processos.filter((p) => dentro(p[marco], j));
  const confiaveis = noPeriodo.filter(temTempoConfiavel);
  const dias = confiaveis.map((p) =>
    // Marco antes da abertura informada é digitação errada da data: conta 0, não negativo.
    Math.max(0, (p[marco]!.getTime() - p.dataAbertura.getTime()) / DIA_MS),
  );
  const m = mediana(dias);
  return {
    valor: m === null ? null : Math.round(m * 10) / 10,
    base: confiaveis.length,
    excluidos: noPeriodo.length - confiaveis.length,
  };
}

// ── Fonte pública ─────────────────────────────────────────────────────────

export interface ProcessoFonteInput {
  dataAbertura: Date;
  /** Algum preço `incluido` em qualquer item. */
  temPreco: boolean;
  /** Algum preço `incluido` com fonte `contratacao_publica`. */
  temPrecoPublico: boolean;
}

/**
 * % dos processos abertos na janela (e que já têm preço) que usam a fonte
 * prioritária da IN 65/2021. Os ainda sem preço ficam fora — não falharam em
 * usar fonte pública, só não começaram.
 */
export function percentualFontePublica(processos: ProcessoFonteInput[], j: Janela): Indicador {
  const abertos = processos.filter((p) => dentro(p.dataAbertura, j));
  const comPreco = abertos.filter((p) => p.temPreco);
  return {
    valor: percentual(comPreco.filter((p) => p.temPrecoPublico).length, comPreco.length),
    base: comPreco.length,
    excluidos: abertos.length - comPreco.length,
  };
}

// ── Cotações e propostas ──────────────────────────────────────────────────

export interface CotacaoDesempenhoInput {
  dataEnvio: Date;
  status: "positiva" | "negativa" | "incompleta" | "silenciosa";
  categorias: string[];
}

export function respondeu(c: Pick<CotacaoDesempenhoInput, "status">): boolean {
  return c.status !== "silenciosa";
}

export function taxaResposta(cotacoes: CotacaoDesempenhoInput[], j: Janela): Indicador {
  const enviadas = cotacoes.filter((c) => dentro(c.dataEnvio, j));
  return {
    valor: percentual(enviadas.filter(respondeu).length, enviadas.length),
    base: enviadas.length,
    excluidos: 0,
  };
}

/** Sem acento, sem diferença de caixa e espaços colapsados (decisão Q17). */
export function normalizarCategoria(c: string): string {
  return c
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const SEM_CATEGORIA = "Sem categoria";

export interface TaxaCategoria {
  categoria: string;
  enviadas: number;
  respondidas: number;
  taxa: number;
}

/**
 * Taxa de resposta por categoria do fornecedor. Uma cotação conta em cada
 * categoria do seu fornecedor (grafias equivalentes somam juntas; o rótulo
 * exibido é a primeira grafia vista). Ordenado por volume enviado.
 */
export function taxaRespostaPorCategoria(
  cotacoes: CotacaoDesempenhoInput[],
  j: Janela,
): TaxaCategoria[] {
  const grupos = new Map<string, { rotulo: string; enviadas: number; respondidas: number }>();
  for (const c of cotacoes) {
    if (!dentro(c.dataEnvio, j)) continue;
    const brutas = c.categorias.map((x) => x.trim()).filter(Boolean);
    const vistas = new Set<string>();
    for (const rotulo of brutas.length > 0 ? brutas : [SEM_CATEGORIA]) {
      const chave = normalizarCategoria(rotulo);
      if (vistas.has(chave)) continue; // mesma categoria repetida no fornecedor
      vistas.add(chave);
      const g = grupos.get(chave) ?? { rotulo, enviadas: 0, respondidas: 0 };
      g.enviadas += 1;
      if (respondeu(c)) g.respondidas += 1;
      grupos.set(chave, g);
    }
  }
  return [...grupos.values()]
    .map((g) => ({
      categoria: g.rotulo,
      enviadas: g.enviadas,
      respondidas: g.respondidas,
      taxa: Math.round((g.respondidas / g.enviadas) * 100),
    }))
    .sort((a, b) => b.enviadas - a.enviadas || a.categoria.localeCompare(b.categoria));
}

export interface PropostaInput {
  createdAt: Date;
  statusGeral: "valida" | "com_ressalva" | "invalida";
}

export function percentualPropostasInvalidas(propostas: PropostaInput[], j: Janela): Indicador {
  const noPeriodo = propostas.filter((p) => dentro(p.createdAt, j));
  return {
    valor: percentual(noPeriodo.filter((p) => p.statusGeral === "invalida").length, noPeriodo.length),
    base: noPeriodo.length,
    excluidos: 0,
  };
}

// ── Fontes até suficiência ────────────────────────────────────────────────

export interface ItemFontesInput {
  /** Abertura do processo do item. */
  dataAbertura: Date;
  incluidos: number;
  /** Preços registrados no item, incluídos e excluídos. */
  pesquisados: number;
}

/**
 * Média de preços pesquisados (incluídos + excluídos) nos itens que já
 * chegaram à série mínima, entre os itens de processos abertos na janela.
 * Itens ainda sem série mínima ficam fora: não chegaram à suficiência.
 */
export function mediaFontesAteSuficiencia(itens: ItemFontesInput[], j: Janela): Indicador {
  const doPeriodo = itens.filter((i) => dentro(i.dataAbertura, j));
  const suficientes = doPeriodo.filter((i) => i.incluidos >= SERIE_MINIMA_PRECOS);
  const total = suficientes.reduce((a, i) => a + i.pesquisados, 0);
  return {
    valor: suficientes.length > 0 ? Math.round((total / suficientes.length) * 10) / 10 : null,
    base: suficientes.length,
    excluidos: doPeriodo.length - suficientes.length,
  };
}

// ── Comparação ────────────────────────────────────────────────────────────

export interface Variacao {
  /** atual − anterior, na unidade do indicador. */
  diferenca: number;
  /** A variação é boa para a operação? (tempo menor = bom; taxa maior = bom). */
  melhorou: boolean;
}

export function variacao(
  atual: Indicador,
  anterior: Indicador,
  sentido: "menor_melhor" | "maior_melhor",
): Variacao | null {
  if (atual.valor === null || anterior.valor === null) return null;
  const diferenca = Math.round((atual.valor - anterior.valor) * 10) / 10;
  if (diferenca === 0) return null;
  return { diferenca, melhorou: sentido === "menor_melhor" ? diferenca < 0 : diferenca > 0 };
}

// ── Texto ─────────────────────────────────────────────────────────────────

/**
 * Cobertura em português, para ir sob o número: "sobre 18 processos · 7 sem
 * data confiável". `unidade` no plural; `motivoExclusao` descreve os de fora.
 */
export function textoCobertura(
  ind: Indicador,
  unidade: { singular: string; plural: string },
  motivoExclusao?: string,
): string {
  if (ind.base === 0 && ind.excluidos === 0) return `nenhum caso no período`;
  const base = `sobre ${ind.base} ${ind.base === 1 ? unidade.singular : unidade.plural}`;
  return ind.excluidos > 0 && motivoExclusao ? `${base} · ${ind.excluidos} ${motivoExclusao}` : base;
}
