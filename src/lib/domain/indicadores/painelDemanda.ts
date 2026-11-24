import { PASSAGENS_OBRIGATORIAS, recorrenciasDoProcesso, type Remessa } from "./demanda";

/**
 * Painel "Demanda da Divisão" (M30.e, redesenho aprovado em 2026-11-24): onde a Divisão perde tempo.
 * Módulo PURO — recebe as remessas já lidas (`lerRemessas`) e devolve os números do dashboard.
 *
 * Regras decididas com o usuário:
 *  - Devolução = passagem além da 3ª de um processo no ANO (a 4ª em diante). A passagem é atribuída ao mês
 *    em que aconteceu.
 *  - Comparativo: o ano corrente vai de 1º de janeiro até hoje e é comparado ao MESMO trecho do ano
 *    anterior; ano fechado é comparado ao ano anterior inteiro.
 *  - Intervalo entre passagens: dias corridos, mediana; passagens no mesmo dia valem 0.
 *  - Nível do processo: normal até 3 passagens, atenção de 4 a 6, crítico a partir de 7.
 *  - Categorias: Bens, Serviços, Geral/Expedientes e Outros (as pequenas ficam juntas).
 *
 * Datas são texto "YYYY-MM-DD" (como em `Remessa`): nada aqui depende de fuso nem de Date local.
 */

export type CategoriaProcesso = "bens" | "servicos" | "geral" | "outros";

export const CATEGORIAS: { id: CategoriaProcesso; rotulo: string }[] = [
  { id: "bens", rotulo: "Aquisição de Bens" },
  { id: "servicos", rotulo: "Aquisição de Serviços" },
  { id: "geral", rotulo: "Geral / Expedientes" },
  { id: "outros", rotulo: "Outros" },
];

/** Categorias com menos remessas que isto são "amostra pequena": não viram manchete nas frases. */
export const MIN_REMESSAS_CATEGORIA = 20;
/** A partir de quantas passagens o processo pede atenção (4ª = primeira devolução). */
export const LIMIAR_ATENCAO = PASSAGENS_OBRIGATORIAS + 1;
/** A partir de quantas passagens o processo é crítico. */
export const LIMIAR_CRITICO = 7;

export type NivelProcesso = "normal" | "atencao" | "critico";

export function nivelDoProcesso(passagens: number): NivelProcesso {
  if (passagens >= LIMIAR_CRITICO) return "critico";
  if (passagens >= LIMIAR_ATENCAO) return "atencao";
  return "normal";
}

/** Categoria pelo rótulo da planilha ("Aquisição de Bens Nº 5/2026 - volume 1"). */
export function categoriaDoRotulo(rotulo: string): CategoriaProcesso {
  const t = rotulo.trim().toLowerCase();
  if (t.includes("aquisição de bens")) return "bens";
  if (t.includes("aquisição de serviços")) return "servicos";
  if (t.startsWith("geral")) return "geral";
  return "outros";
}

/**
 * Filtros do painel vindos da URL (`?ano=2025&categoria=bens`). Valor fora do esperado é ignorado — nunca vira
 * ano nem categoria —, então um link adulterado só mostra o painel padrão.
 */
export function lerFiltrosDoPainel(params: { ano?: string; categoria?: string }): {
  ano?: number;
  categoria: CategoriaProcesso | null;
} {
  const ano = /^\d{4}$/.test(params.ano ?? "") ? Number(params.ano) : undefined;
  const categoria = CATEGORIAS.find((c) => c.id === params.categoria)?.id ?? null;
  return { ano, categoria };
}

// ------------------------------------------------------------------ datas (texto, UTC)

function emDias(data: string): number {
  return (
    Date.UTC(Number(data.slice(0, 4)), Number(data.slice(5, 7)) - 1, Number(data.slice(8, 10))) /
    86_400_000
  );
}

export function diasEntre(anterior: string, posterior: string): number {
  return emDias(posterior) - emDias(anterior);
}

export function somarDias(data: string, dias: number): string {
  const d = new Date((emDias(data) + dias) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Mês (1–12) e dia de uma data, para o corte "até o mesmo dia do ano". */
export interface DiaDoAno {
  mes: number;
  dia: number;
}

function diaDoAno(data: string): DiaDoAno {
  return { mes: Number(data.slice(5, 7)), dia: Number(data.slice(8, 10)) };
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  const meio = s.length >> 1;
  return s.length % 2 === 1 ? s[meio]! : (s[meio - 1]! + s[meio]!) / 2;
}

// ------------------------------------------------------------------ filtros

export interface FiltroRemessas {
  ano: number;
  categoria?: CategoriaProcesso | null;
  /** Corte inclusivo "até o dia": só remessas até esse mês/dia do ano. */
  ate?: DiaDoAno | null;
}

export function filtrarRemessas(remessas: Remessa[], f: FiltroRemessas): Remessa[] {
  return remessas.filter((r) => {
    if (r.ano !== f.ano) return false;
    if (f.categoria && categoriaDoRotulo(r.rotulo) !== f.categoria) return false;
    if (
      f.ate &&
      (r.mes > f.ate.mes || (r.mes === f.ate.mes && Number(r.data.slice(8, 10)) > f.ate.dia))
    )
      return false;
    return true;
  });
}

// ------------------------------------------------------------------ agrupamento por processo

/** Passagens de cada processo, em ordem cronológica (empate no mesmo dia: pelo id do e-mail, estável). */
function agruparPorProcesso(remessas: Remessa[]): Map<string, Remessa[]> {
  const mapa = new Map<string, Remessa[]>();
  for (const r of remessas) {
    const lista = mapa.get(r.chave);
    if (lista) lista.push(r);
    else mapa.set(r.chave, [r]);
  }
  for (const lista of mapa.values()) {
    lista.sort(
      (a, b) => a.data.localeCompare(b.data) || (a.idEmail ?? "").localeCompare(b.idEmail ?? ""),
    );
  }
  return mapa;
}

function intervalos(lista: Remessa[]): number[] {
  const saida: number[] = [];
  for (let i = 1; i < lista.length; i++) saida.push(diasEntre(lista[i - 1]!.data, lista[i]!.data));
  return saida;
}

// ------------------------------------------------------------------ resumo do período

export interface ResumoPeriodo {
  remessas: number;
  processos: number;
  /** Passagens além da 3ª de cada processo. */
  devolucoes: number;
  /** Processos com mais de 3 passagens. */
  processosDevolvidos: number;
  /** devolucoes ÷ remessas (0 a 1). */
  taxaDevolucao: number;
  /** processosDevolvidos ÷ processos (0 a 1). */
  pctProcessosDevolvidos: number;
  /** Passagens por processo. */
  mediaPassagens: number;
  maxPassagens: number;
  /** Mediana dos intervalos entre passagens consecutivas do mesmo processo, em dias corridos. */
  intervaloMedianoDias: number | null;
}

/** As remessas recebidas já devem ser de um só ano (e, se for o caso, de uma só categoria). */
export function resumirPeriodo(remessas: Remessa[]): ResumoPeriodo {
  const porProcesso = agruparPorProcesso(remessas);
  let devolucoes = 0;
  let devolvidos = 0;
  let maior = 0;
  const todosIntervalos: number[] = [];
  for (const lista of porProcesso.values()) {
    devolucoes += recorrenciasDoProcesso(lista.length);
    if (lista.length > PASSAGENS_OBRIGATORIAS) devolvidos++;
    maior = Math.max(maior, lista.length);
    todosIntervalos.push(...intervalos(lista));
  }
  const n = remessas.length;
  const processos = porProcesso.size;
  return {
    remessas: n,
    processos,
    devolucoes,
    processosDevolvidos: devolvidos,
    taxaDevolucao: n === 0 ? 0 : devolucoes / n,
    pctProcessosDevolvidos: processos === 0 ? 0 : devolvidos / processos,
    mediaPassagens: processos === 0 ? 0 : n / processos,
    maxPassagens: maior,
    intervaloMedianoDias: mediana(todosIntervalos),
  };
}

// ------------------------------------------------------------------ série mensal

export interface MesSerie {
  mes: number;
  remessas: number;
  /** Passagens além da 3ª que aconteceram neste mês. */
  devolucoes: number;
}

/** Doze meses, de janeiro a dezembro (meses sem remessa com zero). */
export function serieMensal(remessas: Remessa[]): MesSerie[] {
  const serie: MesSerie[] = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    remessas: 0,
    devolucoes: 0,
  }));
  for (const lista of agruparPorProcesso(remessas).values()) {
    lista.forEach((r, i) => {
      const m = serie[r.mes - 1]!;
      m.remessas++;
      if (i >= PASSAGENS_OBRIGATORIAS) m.devolucoes++;
    });
  }
  return serie;
}

// ------------------------------------------------------------------ por processo

export interface PassagemDoProcesso {
  data: string;
  /** true a partir da 4ª passagem. */
  devolucao: boolean;
  /** Dias desde a passagem anterior; null na primeira. */
  intervaloDias: number | null;
}

export interface ProcessoDetalhado {
  chave: string;
  /** Rótulo da passagem mais recente. */
  rotulo: string;
  categoria: CategoriaProcesso;
  passagens: number;
  devolucoes: number;
  nivel: NivelProcesso;
  primeira: string;
  ultima: string;
  intervaloMedianoDias: number | null;
  maiorIntervaloDias: number | null;
  /** Dias entre a última passagem e `hoje`. Não significa que o processo terminou: remessas não registram conclusão. */
  diasSemNovaPassagem: number | null;
  historico: PassagemDoProcesso[];
}

/** Mais passagens primeiro; empate pela chave, para a ordem não oscilar entre leituras. */
export function detalharProcessos(
  remessas: Remessa[],
  hoje: string | null = null,
): ProcessoDetalhado[] {
  const saida: ProcessoDetalhado[] = [];
  for (const [chave, lista] of agruparPorProcesso(remessas)) {
    const ints = intervalos(lista);
    const ultima = lista[lista.length - 1]!;
    saida.push({
      chave,
      rotulo: ultima.rotulo,
      categoria: categoriaDoRotulo(ultima.rotulo),
      passagens: lista.length,
      devolucoes: recorrenciasDoProcesso(lista.length),
      nivel: nivelDoProcesso(lista.length),
      primeira: lista[0]!.data,
      ultima: ultima.data,
      intervaloMedianoDias: mediana(ints),
      maiorIntervaloDias: ints.length === 0 ? null : Math.max(...ints),
      diasSemNovaPassagem: hoje === null ? null : diasEntre(ultima.data, hoje),
      historico: lista.map((r, i) => ({
        data: r.data,
        devolucao: i >= PASSAGENS_OBRIGATORIAS,
        intervaloDias: i === 0 ? null : ints[i - 1]!,
      })),
    });
  }
  return saida.sort((a, b) => b.passagens - a.passagens || a.chave.localeCompare(b.chave));
}

// ------------------------------------------------------------------ frases "O que mudou"

export type Tendencia = "piora" | "melhora" | "neutra";

/**
 * Frases estruturadas (a tela as escreve): cada uma traz os números que a sustentam, nunca texto de IA.
 * `piora`/`melhora` seguem o sentido de negócio: mais devolução é pior; mais ou menos remessa é neutro.
 */
export type FraseMudou =
  | {
      codigo: "remessas_7d";
      tendencia: Tendencia;
      atual: number;
      anterior: number;
      variacaoPct: number | null;
    }
  | {
      codigo: "devolucao_30d";
      tendencia: Tendencia;
      atual: number;
      anterior: number;
      deltaPp: number;
    }
  | {
      codigo: "criticos_novos";
      tendencia: Tendencia;
      total: number;
      processos: { chave: string; rotulo: string; passagens: number }[];
    }
  | {
      codigo: "categoria_maior_devolucao";
      tendencia: Tendencia;
      categoria: CategoriaProcesso;
      taxa: number;
      deltaPpAnoAnterior: number | null;
    }
  | {
      codigo: "processo_mais_passagens";
      tendencia: Tendencia;
      chave: string;
      rotulo: string;
      passagens: number;
      ultima: string;
    };

interface Marcada {
  r: Remessa;
  devolucao: boolean;
}

/** Cada remessa com a marca de devolução do SEU processo no SEU ano (vale também na virada de ano). */
function marcarDevolucoes(remessas: Remessa[]): Marcada[] {
  const porAno = new Map<number, Remessa[]>();
  for (const r of remessas) {
    const lista = porAno.get(r.ano);
    if (lista) lista.push(r);
    else porAno.set(r.ano, [r]);
  }
  const saida: Marcada[] = [];
  for (const doAno of porAno.values()) {
    for (const lista of agruparPorProcesso(doAno).values()) {
      lista.forEach((r, i) => saida.push({ r, devolucao: i >= PASSAGENS_OBRIGATORIAS }));
    }
  }
  return saida;
}

const MAX_CRITICOS_NA_FRASE = 3;

export function frasesMudou(
  remessas: Remessa[],
  hoje: string,
  categoria: CategoriaProcesso | null = null,
): FraseMudou[] {
  const ano = Number(hoje.slice(0, 4));
  const base = categoria
    ? remessas.filter((r) => categoriaDoRotulo(r.rotulo) === categoria)
    : remessas;
  const marcadas = marcarDevolucoes(base);
  const entre = (de: number, ate: number) =>
    marcadas.filter(({ r }) => {
      const d = diasEntre(r.data, hoje);
      return d >= de && d <= ate;
    });
  const frases: FraseMudou[] = [];

  const u7 = entre(0, 6).length;
  const a7 = entre(7, 13).length;
  frases.push({
    codigo: "remessas_7d",
    tendencia: "neutra",
    atual: u7,
    anterior: a7,
    variacaoPct: a7 === 0 ? null : (u7 - a7) / a7,
  });

  const u30 = entre(0, 29);
  const a30 = entre(30, 59);
  if (u30.length > 0 && a30.length > 0) {
    const atual = u30.filter((m) => m.devolucao).length / u30.length;
    const anterior = a30.filter((m) => m.devolucao).length / a30.length;
    const deltaPp = (atual - anterior) * 100;
    frases.push({
      codigo: "devolucao_30d",
      tendencia: deltaPp > 0.05 ? "piora" : deltaPp < -0.05 ? "melhora" : "neutra",
      atual,
      anterior,
      deltaPp,
    });
  }

  const doAno = base.filter((r) => r.ano === ano);
  const processos = detalharProcessos(doAno, hoje);
  const criticosNovos = processos.filter((p) => {
    if (p.passagens < LIMIAR_CRITICO) return false;
    const setima = p.historico[LIMIAR_CRITICO - 1]!.data;
    const d = diasEntre(setima, hoje);
    return d >= 0 && d <= 29;
  });
  if (criticosNovos.length > 0) {
    frases.push({
      codigo: "criticos_novos",
      tendencia: "piora",
      total: criticosNovos.length,
      processos: criticosNovos
        .slice(0, MAX_CRITICOS_NA_FRASE)
        .map((p) => ({ chave: p.chave, rotulo: p.rotulo, passagens: p.passagens })),
    });
  }

  const corte = diaDoAno(hoje);
  const taxas = CATEGORIAS.map(({ id }) => {
    const atual = resumirPeriodo(filtrarRemessas(base, { ano, categoria: id, ate: corte }));
    const anterior = resumirPeriodo(
      filtrarRemessas(base, { ano: ano - 1, categoria: id, ate: corte }),
    );
    return { id, atual, anterior };
  })
    .filter((c) => c.atual.remessas >= MIN_REMESSAS_CATEGORIA)
    .sort((a, b) => b.atual.taxaDevolucao - a.atual.taxaDevolucao || a.id.localeCompare(b.id));
  const lider = taxas[0];
  if (lider) {
    const temAnterior = lider.anterior.remessas >= MIN_REMESSAS_CATEGORIA;
    const deltaPp = temAnterior
      ? (lider.atual.taxaDevolucao - lider.anterior.taxaDevolucao) * 100
      : null;
    frases.push({
      codigo: "categoria_maior_devolucao",
      tendencia: "neutra",
      categoria: lider.id,
      taxa: lider.atual.taxaDevolucao,
      deltaPpAnoAnterior: deltaPp,
    });
  }

  const topo = processos[0];
  if (topo) {
    frases.push({
      codigo: "processo_mais_passagens",
      tendencia: "neutra",
      chave: topo.chave,
      rotulo: topo.rotulo,
      passagens: topo.passagens,
      ultima: topo.ultima,
    });
  }
  return frases;
}

// ------------------------------------------------------------------ painel completo

export interface CategoriaNoPainel {
  categoria: CategoriaProcesso;
  atual: ResumoPeriodo;
  anterior: ResumoPeriodo | null;
}

export interface PainelDemanda {
  ano: number;
  categoria: CategoriaProcesso | null;
  /** Data de referência ("hoje" dos dados: a remessa mais recente lida). */
  hoje: string;
  /** true quando `ano` é o ano de `hoje`: o período é 1º/jan até `hoje`. */
  parcial: boolean;
  /** Mesmo trecho do ano anterior (parcial) ou o ano anterior inteiro (ano fechado). */
  corte: DiaDoAno | null;
  atual: ResumoPeriodo;
  /** null quando não há remessa no ano anterior (primeiro ano de dados). */
  anterior: ResumoPeriodo | null;
  serie: { atual: MesSerie[]; anterior: MesSerie[] | null };
  porCategoria: CategoriaNoPainel[];
  processos: ProcessoDetalhado[];
  /** Só no ano corrente: "o que mudou" não faz sentido para um ano fechado. */
  frases: FraseMudou[];
}

export function dataMaisRecente(remessas: Remessa[]): string | null {
  let max: string | null = null;
  for (const r of remessas) if (max === null || r.data > max) max = r.data;
  return max;
}

export function montarPainelDemanda(
  remessas: Remessa[],
  opcoes: { ano: number; hoje: string; categoria?: CategoriaProcesso | null },
): PainelDemanda {
  const { ano, hoje } = opcoes;
  const categoria = opcoes.categoria ?? null;
  const parcial = ano === Number(hoje.slice(0, 4));
  const corte = parcial ? diaDoAno(hoje) : null;

  const doAno = filtrarRemessas(remessas, { ano, categoria, ate: corte });
  const doAnoAnterior = filtrarRemessas(remessas, { ano: ano - 1, categoria, ate: corte });
  const temAnterior = doAnoAnterior.length > 0;
  // O gráfico mostra o ano anterior INTEIRO (a sazonalidade); só os KPIs comparam o mesmo trecho.
  const anteriorInteiro = filtrarRemessas(remessas, { ano: ano - 1, categoria });

  return {
    ano,
    categoria,
    hoje,
    parcial,
    corte,
    atual: resumirPeriodo(doAno),
    anterior: temAnterior ? resumirPeriodo(doAnoAnterior) : null,
    serie: {
      atual: serieMensal(doAno),
      anterior: anteriorInteiro.length > 0 ? serieMensal(anteriorInteiro) : null,
    },
    porCategoria: CATEGORIAS.map(({ id }) => {
      const a = filtrarRemessas(remessas, { ano, categoria: id, ate: corte });
      const p = filtrarRemessas(remessas, { ano: ano - 1, categoria: id, ate: corte });
      return {
        categoria: id,
        atual: resumirPeriodo(a),
        anterior: p.length > 0 ? resumirPeriodo(p) : null,
      };
    }),
    processos: detalharProcessos(doAno, parcial ? hoje : null),
    frases: parcial ? frasesMudou(remessas, hoje, categoria) : [],
  };
}
