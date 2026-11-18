/**
 * Camada de DESEMPENHO do dashboard (M30.b) — as métricas de sucesso do PRD
 * que o dado já existente sustenta. Pura: recebe agregados e a janela.
 *
 * Regra de toda função aqui: devolver o valor JUNTO com a cobertura (sobre
 * quantos casos ele foi calculado e quantos ficaram de fora). Um número limpo
 * calculado sobre uma base suja é pior que nenhum (CLAUDE.md §9.85).
 */
import { SERIE_MINIMA_PRECOS } from "./marcos";

export type Periodo = "30d" | "90d" | "12m" | "ano";

export const PERIODOS: Periodo[] = ["30d", "90d", "12m", "ano"];
export const PERIODO_PADRAO: Periodo = "90d";

export const PERIODO_LABEL: Record<Periodo, string> = {
  "30d": "30 dias",
  "90d": "90 dias",
  "12m": "12 meses",
  ano: "Ano",
};

/** Título da seção: "ano" depende da data de hoje (desde 1º de janeiro do ano corrente). */
export function tituloPeriodo(periodo: Periodo, agora: Date): string {
  return periodo === "ano"
    ? `ano de ${anoEmSaoPaulo(agora)}, desde 1º de janeiro`
    : `últimos ${PERIODO_LABEL[periodo]}`;
}

function anoEmSaoPaulo(data: Date): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(data));
}

const DIA_MS = 24 * 60 * 60 * 1000;
const DURACAO_DIAS: Record<Exclude<Periodo, "ano">, number> = { "30d": 30, "90d": 90, "12m": 365 };

export interface Janela {
  inicio: Date;
  fim: Date;
}

export function lerPeriodo(valor: string | undefined): Periodo {
  return PERIODOS.includes(valor as Periodo) ? (valor as Periodo) : PERIODO_PADRAO;
}

/** Janela atual `[agora − duração, agora)` e a anterior, de mesmo tamanho. */
export function janelas(periodo: Periodo, agora: Date): { atual: Janela; anterior: Janela } {
  // "ano": do 1º de janeiro (meia-noite em Brasília) até agora. A janela anterior tem o mesmo
  // tamanho, como nos demais períodos, e a base de cada indicador mostra o quanto ela tem de dado.
  const inicio =
    periodo === "ano"
      ? new Date(`${anoEmSaoPaulo(agora)}-01-01T00:00:00-03:00`)
      : new Date(agora.getTime() - DURACAO_DIAS[periodo] * DIA_MS);
  const dur = agora.getTime() - inicio.getTime();
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

/**
 * Percentual inteiro; abaixo de 10% mantém uma casa decimal, senão 63/7500 (0,84%) aparece como
 * "1%" e esconde a diferença entre quase nada e um por cento.
 */
function percentual(parte: number, todo: number): number | null {
  if (todo <= 0) return null;
  const v = (parte / todo) * 100;
  return v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
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

/** A que processo uma cotação/consulta pertence, para agrupar a taxa de resposta. */
export interface ProcessoRef {
  /** Identidade do grupo: duas consultas do mesmo processo têm a mesma chave. */
  chave: string;
  /** Texto exibido. */
  rotulo: string;
}

export const SEM_PROCESSO: ProcessoRef = { chave: "sem-processo", rotulo: "Sem processo no assunto" };

/**
 * Processo de um envio. Vinculado: o número cadastrado. Sem vínculo mas com número no assunto:
 * o número como veio, marcado "não cadastrado" — o analista vê onde falta cadastrar em vez de
 * o envio sumir. Sem nenhum dos dois: um grupo só.
 */
export function referenciaProcesso(envio: {
  processoId: string | null;
  processoNumero: string | null;
  numeroProcessoAssunto: string | null;
}): ProcessoRef {
  if (envio.processoId && envio.processoNumero) {
    return { chave: `p:${envio.processoId}`, rotulo: envio.processoNumero };
  }
  const assunto = envio.numeroProcessoAssunto?.trim();
  if (assunto) return { chave: `a:${assunto}`, rotulo: `Nº ${assunto} · não cadastrado` };
  return SEM_PROCESSO;
}

export interface CotacaoDesempenhoInput {
  dataEnvio: Date;
  status: "positiva" | "negativa" | "incompleta" | "silenciosa";
  processo: ProcessoRef;
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

export interface TaxaProcesso {
  chave: string;
  processo: string;
  enviadas: number;
  respondidas: number;
  taxa: number;
}

/**
 * Taxa de resposta por processo: de quantos fornecedores consultados naquele processo, quantos
 * responderam (recusa conta como resposta). Ordenado por volume enviado, depois pelo rótulo.
 */
export function taxaRespostaPorProcesso(cotacoes: CotacaoDesempenhoInput[], j: Janela): TaxaProcesso[] {
  const grupos = new Map<string, { rotulo: string; enviadas: number; respondidas: number }>();
  for (const c of cotacoes) {
    if (!dentro(c.dataEnvio, j)) continue;
    const g = grupos.get(c.processo.chave) ?? { rotulo: c.processo.rotulo, enviadas: 0, respondidas: 0 };
    g.enviadas += 1;
    if (respondeu(c)) g.respondidas += 1;
    grupos.set(c.processo.chave, g);
  }
  return [...grupos.entries()]
    .map(([chave, g]) => ({
      chave,
      processo: g.rotulo,
      enviadas: g.enviadas,
      respondidas: g.respondidas,
      taxa: Math.round((g.respondidas / g.enviadas) * 100),
    }))
    .sort((a, b) => b.enviadas - a.enviadas || a.processo.localeCompare(b.processo));
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

// ── Consultas por e-mail (M30.d) ───────────────────────────────────────────

export type SituacaoConsultaInput =
  | "sem_resposta"
  | "a_confirmar"
  | "orcamento"
  | "recusa"
  | "duvida"
  | "email_invalido";

export interface ConsultaDesempenhoInput {
  dataEnvio: Date;
  dataResposta: Date | null;
  situacao: SituacaoConsultaInput;
  processo: ProcessoRef;
  /**
   * Resposta que a IA classificou mas que não foi ligada a um fornecedor (M30.d). Conta no
   * NUMERADOR da categoria (orçamento/recusa/dúvida): o fornecedor que respondeu já está no
   * denominador como consultado. Fica FORA de tudo o mais (consultadas, taxa de resposta, tempo,
   * e-mails devolvidos, por processo), senão a mesma consulta entraria duas vezes.
   */
  semFornecedor?: boolean;
}

const STATUS_DA_SITUACAO: Record<
  Exclude<SituacaoConsultaInput, "email_invalido">,
  CotacaoDesempenhoInput["status"]
> = {
  sem_resposta: "silenciosa",
  // Ainda sem saber se é dúvida, orçamento ou recusa (pode ser só "recebi"): NÃO conta como
  // resposta até o analista confirmar — só dúvida, orçamento e recusa contam.
  a_confirmar: "silenciosa",
  orcamento: "positiva",
  recusa: "negativa",
  // Pediu esclarecimento: é resposta (só a confirmação de recebimento não é).
  duvida: "incompleta",
};

/**
 * Consultas como cotações, para reaproveitar as contas de taxa de resposta. E-mail que voltou
 * NÃO entra: o fornecedor nunca recebeu a solicitação, então não é "silêncio" — contá-lo como
 * sem resposta jogaria para baixo a taxa por culpa do cadastro, não do fornecedor.
 */
export function consultasComoCotacoes(consultas: ConsultaDesempenhoInput[]): CotacaoDesempenhoInput[] {
  return consultas
    .filter((c) => c.situacao !== "email_invalido" && !c.semFornecedor)
    .map((c) => ({
      dataEnvio: c.dataEnvio,
      status: STATUS_DA_SITUACAO[c.situacao as keyof typeof STATUS_DA_SITUACAO],
      processo: c.processo,
    }));
}

export function taxaRespostaConsultas(consultas: ConsultaDesempenhoInput[], j: Janela): Indicador {
  const ind = taxaResposta(consultasComoCotacoes(consultas), j);
  return {
    ...ind,
    // Os que voltaram ficam FORA da conta, mas aparecem na cobertura.
    excluidos: consultas.filter((c) => c.situacao === "email_invalido" && dentro(c.dataEnvio, j)).length,
  };
}

export interface ContagemConsultas {
  /** Consultas enviadas na janela, sem os e-mails devolvidos. */
  consultadas: number;
  orcamentos: number;
  recusas: number;
  duvidas: number;
  /** Respondeu, mas o analista ainda não confirmou o tipo — fora das três contas. */
  aConfirmar: number;
  invalidos: number;
}

/** Quantas consultas da janela caíram em cada situação (base dos cards Orçamentos/Recusas). */
export function contarConsultas(consultas: ConsultaDesempenhoInput[], j: Janela): ContagemConsultas {
  const daJanelaTodas = consultas.filter((c) => dentro(c.dataEnvio, j));
  const daJanela = daJanelaTodas.filter((c) => !c.semFornecedor);
  const n = (s: SituacaoConsultaInput) => daJanela.filter((c) => c.situacao === s).length;
  // Sem fornecedor ligado: só somam ao numerador da categoria, nunca ao denominador.
  const extra = (s: SituacaoConsultaInput) => daJanelaTodas.filter((c) => c.semFornecedor && c.situacao === s).length;
  const invalidos = n("email_invalido");
  return {
    consultadas: daJanela.length - invalidos,
    orcamentos: n("orcamento") + extra("orcamento"),
    recusas: n("recusa") + extra("recusa"),
    duvidas: n("duvida") + extra("duvida"),
    aConfirmar: n("a_confirmar"),
    invalidos,
  };
}

/** % das consultas (sem e-mail devolvido) que terminaram na situação pedida. */
export function percentualDaSituacao(
  consultas: ConsultaDesempenhoInput[],
  j: Janela,
  situacao: "orcamento" | "recusa" | "duvida",
): Indicador {
  const c = contarConsultas(consultas, j);
  const parte = { orcamento: c.orcamentos, recusa: c.recusas, duvida: c.duvidas }[situacao];
  return { valor: percentual(parte, c.consultadas), base: c.consultadas, excluidos: c.invalidos };
}

/** Mediana, em dias, entre o envio e a resposta — pelos fornecedores que responderam NA janela. */
export function tempoRespostaDias(consultas: ConsultaDesempenhoInput[], j: Janela): Indicador {
  const respondidas = consultas.filter(
    (c) =>
      !c.semFornecedor &&
      (c.situacao === "orcamento" || c.situacao === "recusa" || c.situacao === "duvida") &&
      dentro(c.dataResposta, j),
  );
  const dias = respondidas.map((c) =>
    Math.max(0, (c.dataResposta!.getTime() - c.dataEnvio.getTime()) / DIA_MS),
  );
  const m = mediana(dias);
  return {
    valor: m === null ? null : Math.round(m * 10) / 10,
    base: respondidas.length,
    excluidos: 0,
  };
}

/** % dos e-mails consultados na janela que voltaram — mede a higiene da lista de envio. */
export function percentualEmailsInvalidos(consultas: ConsultaDesempenhoInput[], j: Janela): Indicador {
  const enviadas = consultas.filter((c) => !c.semFornecedor && dentro(c.dataEnvio, j));
  return {
    valor: percentual(enviadas.filter((c) => c.situacao === "email_invalido").length, enviadas.length),
    base: enviadas.length,
    excluidos: 0,
  };
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
