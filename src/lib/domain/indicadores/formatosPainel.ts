import { CATEGORIAS, type FraseMudou, type ProcessoDetalhado } from "./painelDemanda";

/**
 * Texto do painel "Demanda da Divisão": formatação pt-BR, variações com o sentido de negócio e as frases de
 * "O que mudou". Puro: a tela só desenha o que sai daqui, e é aqui que os textos são testados.
 */

const nf = (casas: number) => (x: number) =>
  x.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const f0 = nf(0);
const f1 = nf(1);

/** 0,5465 → "54,7%". */
export function pct(x: number): string {
  return `${f1(x * 100)}%`;
}

/** Número com no máximo uma casa decimal: 8,5 e 8 (sem "8,0"). */
export function numeroCurto(x: number): string {
  return x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** "2026-11-17" → "17/11/2026", sem passar por Date (não depende de fuso). */
export function dataBr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function rotuloDaCategoria(id: string): string {
  return CATEGORIAS.find((c) => c.id === id)?.rotulo ?? id;
}

// ------------------------------------------------------------------ variações

export type Tom = "bom" | "ruim" | "neutro";

export interface Variacao {
  texto: string;
  tom: Tom;
}

const MENOS = "−"; // sinal de menos de verdade, que não quebra a linha entre o sinal e o número

function sinal(v: number): string {
  return v > 0 ? "+" : v < 0 ? MENOS : "";
}

/**
 * Tom da variação: `boaQuandoCai` = true quando cair é melhor (devolução, intervalo); null quando não há bom nem
 * ruim (volume de remessas). Variação menor que `tolerancia` é "neutro", para o ruído não virar alarme.
 */
function tomDe(v: number, tolerancia: number, boaQuandoCai: boolean | null): Tom {
  if (boaQuandoCai === null || Math.abs(v) < tolerancia) return "neutro";
  return v < 0 === boaQuandoCai ? "bom" : "ruim";
}

/** Diferença entre duas taxas (0–1), em pontos percentuais. Sem comparativo: null. */
export function variacaoEmPp(
  atual: number,
  anterior: number | null,
  boaQuandoCai: boolean | null,
): Variacao | null {
  if (anterior === null) return null;
  const v = (atual - anterior) * 100;
  const arred = Math.round(v * 10) / 10;
  return {
    texto: `${sinal(arred)}${f1(Math.abs(arred))} p.p.`,
    tom: tomDe(arred, 0.05, boaQuandoCai),
  };
}

/** Diferença entre dois números simples (passagens por processo, dias). */
export function variacaoEmNumero(
  atual: number,
  anterior: number | null,
  boaQuandoCai: boolean | null,
  unidade = "",
): Variacao | null {
  if (anterior === null) return null;
  const v = Math.round((atual - anterior) * 10) / 10;
  return { texto: `${sinal(v)}${f1(Math.abs(v))}${unidade}`, tom: tomDe(v, 0.05, boaQuandoCai) };
}

// ------------------------------------------------------------------ listas dos KPIs

export type KpiClicavel = "devolucoes" | "devolvidos" | "passagens" | "intervalo";

/** Processos que explicam o KPI, do mais relevante ao menos. Empate pela chave (a ordem não oscila). */
export function processosDoKpi(
  processos: ProcessoDetalhado[],
  kpi: KpiClicavel,
): ProcessoDetalhado[] {
  const cmp = (
    a: ProcessoDetalhado,
    b: ProcessoDetalhado,
    chave: (p: ProcessoDetalhado) => number,
  ) => chave(b) - chave(a) || a.chave.localeCompare(b.chave);
  switch (kpi) {
    case "devolucoes":
      return processos
        .filter((p) => p.devolucoes > 0)
        .sort((a, b) => cmp(a, b, (p) => p.devolucoes));
    case "devolvidos":
      return processos.filter((p) => p.passagens > 3).sort((a, b) => cmp(a, b, (p) => p.passagens));
    case "passagens":
      return [...processos].sort((a, b) => cmp(a, b, (p) => p.passagens));
    case "intervalo":
      return processos
        .filter((p) => p.intervaloMedianoDias !== null)
        .sort((a, b) => cmp(a, b, (p) => p.intervaloMedianoDias!));
  }
}

// ------------------------------------------------------------------ frases "O que mudou"

export type TrechoFrase =
  | { tipo: "texto"; texto: string }
  | { tipo: "forte"; texto: string }
  | { tipo: "processo"; texto: string; chave: string };

const t = (texto: string): TrechoFrase => ({ tipo: "texto", texto });
const forte = (texto: string): TrechoFrase => ({ tipo: "forte", texto });

/** Junta os trechos de uma frase em texto simples (para teste e leitor de tela). */
export function frasePlana(trechos: TrechoFrase[]): string {
  return trechos.map((x) => x.texto).join("");
}

export function trechosDaFrase(f: FraseMudou): TrechoFrase[] {
  switch (f.codigo) {
    case "remessas_7d": {
      const variacao =
        f.variacaoPct === null ? "" : `, ${sinal(f.variacaoPct)}${pct(Math.abs(f.variacaoPct))}`;
      return [
        t(`Nos últimos 7 dias ${f.atual === 1 ? "chegou" : "chegaram"} `),
        forte(`${f0(f.atual)} ${f.atual === 1 ? "remessa" : "remessas"}`),
        t(` (${f0(f.anterior)} nos 7 dias anteriores${variacao}).`),
      ];
    }
    case "devolucao_30d": {
      const pp = Math.round(f.deltaPp * 10) / 10;
      return [
        t("Nos últimos 30 dias, "),
        forte(pct(f.atual)),
        t(
          ` das passagens foram devoluções (${pct(f.anterior)} nos 30 dias anteriores; ${sinal(pp)}${f1(Math.abs(pp))} p.p.).`,
        ),
      ];
    }
    case "criticos_novos": {
      const lista: TrechoFrase[] = [];
      f.processos.forEach((p, i) => {
        if (i > 0)
          lista.push(
            t(i === f.processos.length - 1 && f.total === f.processos.length ? " e " : ", "),
          );
        lista.push({ tipo: "processo", texto: p.rotulo, chave: p.chave });
      });
      const resto = f.total - f.processos.length;
      return [
        forte(`${f0(f.total)} ${f.total === 1 ? "processo chegou" : "processos chegaram"}`),
        t(" à 7ª passagem (nível crítico) nos últimos 30 dias: "),
        ...lista,
        t(resto > 0 ? ` e mais ${f0(resto)}.` : "."),
      ];
    }
    case "categoria_maior_devolucao": {
      const comp =
        f.deltaPpAnoAnterior === null
          ? ""
          : ` (${sinal(Math.round(f.deltaPpAnoAnterior * 10) / 10)}${f1(Math.abs(Math.round(f.deltaPpAnoAnterior * 10) / 10))} p.p. contra o mesmo período do ano anterior)`;
      return [
        t("A maior taxa de devolução no ano é de "),
        forte(rotuloDaCategoria(f.categoria)),
        t(": "),
        forte(pct(f.taxa)),
        t(`${comp}.`),
      ];
    }
    case "processo_mais_passagens":
      return [
        t("O processo com mais passagens é "),
        { tipo: "processo", texto: f.rotulo, chave: f.chave },
        t(": "),
        forte(`${f0(f.passagens)} passagens`),
        t(`, a última em ${dataBr(f.ultima)}.`),
      ];
  }
}
