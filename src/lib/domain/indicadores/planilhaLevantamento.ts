/**
 * Levantamento anual de cotações por e-mail, no formato de PLANILHA (M30.d): as mesmas contas do
 * dashboard (`contarConsultas`, `tempoRespostaDias`, `percentualEmailsInvalidos`), escritas em abas
 * para quem trabalha na planilha do Google. Módulo PURO: recebe os dados já lidos e devolve matrizes
 * de células — quem lê o banco e escreve na planilha é `lib/levantamento/exportarPlanilha.ts`.
 *
 * Não existe segunda fórmula aqui: o que o dashboard chama de orçamento/recusa/dúvida é o que sai
 * nestas abas, porque as duas telas chamam a MESMA função de domínio.
 *
 * Nenhum texto de e-mail entra: só ids opacos do Gmail, endereço consultado, classe e data.
 */
import { linkDoGmail } from "../cotacaoEmail/gmail";
import {
  contarConsultas,
  dentro,
  percentualEmailsInvalidos,
  tempoRespostaDias,
  type ConsultaDesempenhoInput,
  type Janela,
} from "./desempenho";

export const ABA_RESUMO = "Plataforma_Resumo";
export const ABA_POR_MES = "Plataforma_Por_mes";
export const ABA_CONSULTAS = "Plataforma_Consultas";

export type Celula = string | number;

export interface EnvioPlanilha {
  dataEnvio: Date;
  totalDestinatarios: number;
}

/** Uma consulta já respondida ou devolvida (as sem resposta não têm linha: saem de `Lev_Destinatarios`). */
export interface LinhaConsultaPlanilha {
  envioGmailId: string;
  email: string;
  situacao: string;
  regra: string | null;
  dataResposta: Date | null;
  respostaGmailId: string | null;
}

/** O que o script do Gmail (abas `Lev_*`) tem, para cruzar. `null` = a aba não pôde ser lida. */
export interface CruzamentoGmail {
  envios: number | null;
  destinatarios: number | null;
}

export interface EntradaPlanilha {
  ano: number;
  agora: Date;
  consultas: ConsultaDesempenhoInput[];
  envios: EnvioPlanilha[];
  linhas: LinhaConsultaPlanilha[];
  gmail: CruzamentoGmail;
}

export interface Verificacao {
  nome: string;
  /** `null` = não foi possível conferir (não é OK nem divergência). */
  ok: boolean | null;
  detalhe: string;
}

export interface AbasPlanilha {
  resumo: Celula[][];
  porMes: Celula[][];
  consultas: Celula[][];
  verificacoes: Verificacao[];
}

/** Texto que a célula de "gravação conferida" mostra até a releitura confirmar. */
export const GRAVANDO = "(gravando… ainda não conferido)";

/** Linha do resumo onde mora a célula de conferência da gravação (0-based) e a coluna do valor. */
export const CELULA_CONFERENCIA = { linha: 2, coluna: 1 } as const;

const FUSO = "America/Sao_Paulo";

function partesSp(d: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: FUSO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
}

export function dataBr(d: Date): string {
  const p = partesSp(d);
  return `${p.day}/${p.month}/${p.year}`;
}

export function dataHoraBr(d: Date): string {
  const p = partesSp(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

export function anoEmSp(d: Date): number {
  return Number(partesSp(d).year);
}

function mesEmSp(d: Date): number {
  return Number(partesSp(d).month);
}

function inicioDoMes(ano: number, mes: number): Date {
  return new Date(`${ano}-${String(mes).padStart(2, "0")}-01T00:00:00-03:00`);
}

function proximoMes(ano: number, mes: number): Date {
  return mes === 12 ? inicioDoMes(ano + 1, 1) : inicioDoMes(ano, mes + 1);
}

/** Mesmo arredondamento do dashboard: abaixo de 10% uma casa decimal, senão inteiro. */
function pct(parte: number, base: number): string {
  if (base <= 0) return "—";
  const v = (parte / base) * 100;
  const r = v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  return `${String(r).replace(".", ",")}%`;
}

const REGRA_ROTULO: Record<string, string> = {
  manual: "Decisão do analista",
  ia: "IA",
  anexo_orcamento: "Anexo PDF (regra)",
  anexo_orcamento_dominio: "Anexo PDF, ligado pelo domínio (regra)",
  frase_recusa: "Frase de recusa (regra)",
  frase_recusa_dominio: "Frase de recusa, ligada pelo domínio (regra)",
  devolucao: "E-mail devolvido",
};

export function rotuloDaRegra(regra: string | null): string {
  if (!regra) return "—";
  return REGRA_ROTULO[regra] ?? regra;
}

const SITUACAO_ROTULO: Record<string, string> = {
  orcamento: "Orçamento",
  recusa: "Recusa",
  duvida: "Dúvida",
  a_confirmar: "A confirmar",
  email_invalido: "E-mail devolvido",
};

/** Partição EXATA das consultas ligadas a fornecedor (sem as respostas "sem fornecedor"). */
interface Particao {
  contatados: number;
  orcamento: number;
  recusa: number;
  duvida: number;
  aConfirmar: number;
  semResposta: number;
  devolvidos: number;
}

function particionar(consultas: ConsultaDesempenhoInput[], j: Janela): Particao {
  const ligadas = consultas.filter((c) => !c.semFornecedor && dentro(c.dataEnvio, j));
  const n = (s: string) => ligadas.filter((c) => c.situacao === s).length;
  return {
    contatados: ligadas.length,
    orcamento: n("orcamento"),
    recusa: n("recusa"),
    duvida: n("duvida"),
    aConfirmar: n("a_confirmar"),
    semResposta: n("sem_resposta"),
    devolvidos: n("email_invalido"),
  };
}

function somaDasPartes(p: Particao): number {
  return p.orcamento + p.recusa + p.duvida + p.aConfirmar + p.semResposta + p.devolvidos;
}

function verificar(e: EntradaPlanilha, janela: Janela, part: Particao, linhas: LinhaConsultaPlanilha[]): Verificacao[] {
  const enviosAno = e.envios.filter((x) => dentro(x.dataEnvio, janela));
  const destinatariosEnvios = enviosAno.reduce((s, x) => s + x.totalDestinatarios, 0);
  const v: Verificacao[] = [];

  const soma = somaDasPartes(part);
  v.push({
    nome: "Soma dos desfechos = consultas registradas",
    ok: soma === part.contatados,
    detalhe: `${soma} desfechos × ${part.contatados} consultas`,
  });

  v.push({
    nome: "Consultas registradas = destinatários declarados nos envios",
    ok: part.contatados === destinatariosEnvios,
    detalhe: `${part.contatados} consultas × ${destinatariosEnvios} destinatários somados dos ${enviosAno.length} envios`,
  });

  const porSituacao = (s: string) => linhas.filter((l) => l.situacao === s).length;
  const confere = (["orcamento", "recusa", "duvida", "a_confirmar", "email_invalido"] as const).every(
    (s) => porSituacao(s) === { orcamento: part.orcamento, recusa: part.recusa, duvida: part.duvida, a_confirmar: part.aConfirmar, email_invalido: part.devolvidos }[s],
  );
  const respondidasOuDevolvidas = part.orcamento + part.recusa + part.duvida + part.aConfirmar + part.devolvidos;
  v.push({
    nome: "Linhas da aba de consultas = contagem do resumo",
    // além de cada classe, o TOTAL: linha de outra situação (ex.: "sem resposta") não pode escapar.
    ok: confere && linhas.length === respondidasOuDevolvidas,
    detalhe: `${linhas.length} linhas (sem as ${part.semResposta} sem resposta)`,
  });

  v.push(
    e.gmail.envios === null
      ? { nome: "Envios × abas do Gmail (Lev_Envios)", ok: null, detalhe: "aba não encontrada ou ilegível" }
      : {
          nome: "Envios × abas do Gmail (Lev_Envios)",
          ok: e.gmail.envios === enviosAno.length,
          detalhe: `${enviosAno.length} na plataforma × ${e.gmail.envios} no Gmail`,
        },
  );
  v.push(
    e.gmail.destinatarios === null
      ? { nome: "Destinatários × abas do Gmail (Lev_Destinatarios)", ok: null, detalhe: "aba não encontrada ou ilegível" }
      : {
          nome: "Destinatários × abas do Gmail (Lev_Destinatarios)",
          ok: e.gmail.destinatarios === part.contatados,
          detalhe: `${part.contatados} na plataforma × ${e.gmail.destinatarios} no Gmail`,
        },
  );
  return v;
}

function rotuloVerificacao(v: Verificacao): string {
  return v.ok === null ? "NÃO CONFERIDO" : v.ok ? "OK" : "DIVERGE";
}

/** Contagem de decisões por quem decidiu, só das classes úteis (orçamento, recusa, dúvida). */
function porQuemDecidiu(linhas: LinhaConsultaPlanilha[]): [string, number][] {
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    if (l.situacao !== "orcamento" && l.situacao !== "recusa" && l.situacao !== "duvida") continue;
    const k = rotuloDaRegra(l.regra);
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return [...mapa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
}

export function montarAbasPlanilha(e: EntradaPlanilha): AbasPlanilha {
  const janela: Janela = { inicio: inicioDoMes(e.ano, 1), fim: e.agora };
  const part = particionar(e.consultas, janela);
  const dash = contarConsultas(e.consultas, janela); // a conta EXATA do dashboard
  const extras = {
    orcamento: dash.orcamentos - part.orcamento,
    recusa: dash.recusas - part.recusa,
    duvida: dash.duvidas - part.duvida,
  };
  const enviosAno = e.envios.filter((x) => dentro(x.dataEnvio, janela));
  const verificacoes = verificar(e, janela, part, e.linhas);
  const util = dash.orcamentos + dash.recusas + dash.duvidas;
  const tempo = tempoRespostaDias(e.consultas, janela);
  const invalidos = percentualEmailsInvalidos(e.consultas, janela);

  const resumo: Celula[][] = [
    [`LEVANTAMENTO ${e.ano} — PLATAFORMA (as regras e contas do dashboard)`],
    ["Gerado em", dataHoraBr(e.agora)],
    ["Gravação conferida por releitura", GRAVANDO],
    [],
    ["PRODUÇÃO", "Quantidade"],
    ["E-mails de solicitação enviados", enviosAno.length],
    ["Destinatários contatados (consultas registradas)", part.contatados],
    ["Média de destinatários por e-mail", enviosAno.length ? Number((part.contatados / enviosAno.length).toFixed(1)) : 0],
    [],
    ["O QUE ACONTECEU COM CADA DESTINATÁRIO (consultas ligadas a fornecedor)", "Quantidade", "% dos destinatários"],
    ["Orçamento", part.orcamento, pct(part.orcamento, part.contatados)],
    ["Recusa", part.recusa, pct(part.recusa, part.contatados)],
    ["Dúvida", part.duvida, pct(part.duvida, part.contatados)],
    ["A confirmar (respondeu, tipo ainda não definido)", part.aConfirmar, pct(part.aConfirmar, part.contatados)],
    ["Sem resposta", part.semResposta, pct(part.semResposta, part.contatados)],
    ["E-mail devolvido", part.devolvidos, pct(part.devolvidos, part.contatados)],
    [],
    ["NÚMEROS DO DASHBOARD (base = consultas entregues, sem os e-mails devolvidos)", "Quantidade", "% das consultas entregues"],
    ["Consultas entregues", dash.consultadas, ""],
    ["Orçamentos (inclui respostas sem fornecedor ligado)", dash.orcamentos, pct(dash.orcamentos, dash.consultadas)],
    ["Recusas (inclui respostas sem fornecedor ligado)", dash.recusas, pct(dash.recusas, dash.consultadas)],
    ["Dúvidas (inclui respostas sem fornecedor ligado)", dash.duvidas, pct(dash.duvidas, dash.consultadas)],
    ["RETORNO ÚTIL (orçamento + recusa + dúvida)", util, pct(util, dash.consultadas)],
    [
      "    respostas já classificadas sem fornecedor ligado (orçamento / recusa / dúvida)",
      extras.orcamento + extras.recusa + extras.duvida,
      `${extras.orcamento} / ${extras.recusa} / ${extras.duvida}`,
    ],
    ["Tempo mediano até a resposta (dias)", tempo.valor ?? "—", `base: ${tempo.base} respostas`],
    ["E-mails devolvidos (higiene da lista)", part.devolvidos, invalidos.valor === null ? "—" : `${String(invalidos.valor).replace(".", ",")}%`],
    [],
    ["QUEM DECIDIU A CLASSE (orçamento, recusa e dúvida ligados a fornecedor)", "Quantidade"],
    ...porQuemDecidiu(e.linhas).map(([k, n]) => [k, n] as Celula[]),
    [],
    ["CONFERÊNCIAS", "Resultado", "Detalhe"],
    ...verificacoes.map((v) => [v.nome, rotuloVerificacao(v), v.detalhe] as Celula[]),
    [],
    ["COMO LER"],
    ["Esta aba usa as mesmas contas do dashboard da plataforma: a classe de cada resposta vem das regras, da IA e das suas decisões na fila."],
    ["As abas Lev_* e o Dashboard do script do Gmail continuam como estão; a diferença entre as duas leituras está na classificação, não na contagem de envios."],
    ["Estas abas são reescritas a cada hora. Não edite nelas: a edição se perde."],
  ];

  // ── Por mês ────────────────────────────────────────────────────────────
  const mesAtual = e.ano === anoEmSp(e.agora) ? mesEmSp(e.agora) : 12;
  const porMes: Celula[][] = [
    ["Mês", "E-mails enviados", "Destinatários", "Orçamento", "Recusa", "Dúvida", "A confirmar", "Sem resposta", "E-mail devolvido", "% retorno útil"],
  ];
  for (let m = 1; m <= mesAtual; m++) {
    const j: Janela = { inicio: inicioDoMes(e.ano, m), fim: proximoMes(e.ano, m) };
    const p = particionar(e.consultas, j);
    const d = contarConsultas(e.consultas, j);
    porMes.push([
      `${e.ano}-${String(m).padStart(2, "0")}`,
      e.envios.filter((x) => dentro(x.dataEnvio, j)).length,
      p.contatados,
      p.orcamento,
      p.recusa,
      p.duvida,
      p.aConfirmar,
      p.semResposta,
      p.devolvidos,
      pct(d.orcamentos + d.recusas + d.duvidas, d.consultadas),
    ]);
  }
  porMes.push([
    "Total",
    enviosAno.length,
    part.contatados,
    part.orcamento,
    part.recusa,
    part.duvida,
    part.aConfirmar,
    part.semResposta,
    part.devolvidos,
    pct(util, dash.consultadas),
  ]);

  // ── Consultas respondidas ou devolvidas ────────────────────────────────
  const consultas: Celula[][] = [
    ["envioId (Gmail)", "E-mail consultado", "Situação", "Quem decidiu", "Data da resposta", "Link da resposta"],
    ...[...e.linhas]
      .sort((a, b) => (b.dataResposta?.getTime() ?? 0) - (a.dataResposta?.getTime() ?? 0) || a.email.localeCompare(b.email))
      .map(
        (l): Celula[] => [
          l.envioGmailId,
          l.email,
          SITUACAO_ROTULO[l.situacao] ?? l.situacao,
          rotuloDaRegra(l.regra),
          l.dataResposta ? dataBr(l.dataResposta) : "",
          l.respostaGmailId ? linkDoGmail(l.respostaGmailId) : "",
        ],
      ),
  ];

  return { resumo, porMes, consultas, verificacoes };
}

/**
 * Compara a matriz que se quis gravar com a que voltou da leitura. A API devolve tudo como texto e
 * corta as células vazias do fim da linha: ambos os lados são normalizados antes. Devolve a primeira
 * diferença (para o erro nomear onde está), ou `null` se forem iguais.
 */
export function primeiraDiferenca(esperado: Celula[][], lido: string[][]): string | null {
  const norm = (m: (Celula | undefined)[][]) =>
    m.map((l) => {
      const t = l.map((c) => String(c ?? ""));
      while (t.length > 0 && t[t.length - 1] === "") t.pop();
      return t;
    });
  const a = norm(esperado);
  const b = norm(lido);
  while (a.length > 0 && a[a.length - 1]!.length === 0) a.pop();
  while (b.length > 0 && b[b.length - 1]!.length === 0) b.pop();
  if (a.length !== b.length) return `${a.length} linhas esperadas × ${b.length} lidas`;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.length !== y.length) return `linha ${i + 1}: ${x.length} colunas esperadas × ${y.length} lidas`;
    for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return `linha ${i + 1}, coluna ${k + 1}`;
  }
  return null;
}
