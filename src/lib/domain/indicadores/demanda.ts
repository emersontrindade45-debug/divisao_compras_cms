/**
 * Demanda da Divisão (M30.e): quantos processos chegaram à Divisão de Compras no ano, quantas vezes
 * cada um voltou (recorrência) e a lista dos processos distintos que de fato trabalhamos.
 *
 * Fonte: a planilha de "remessas" (uma linha por vez que um processo chegou à Divisão), atualizada
 * de hora em hora fora do sistema. Este módulo é PURO — recebe as linhas já lidas do CSV; a leitura
 * da planilha vive em `lib/indicadores/demanda.ts`.
 *
 * Decisões do usuário (2026-11-19): cada linha é uma remessa (duas do mesmo processo no mesmo dia
 * contam como duas); processo distinto = número/ano, ignorando tipo ("Aquisição de Bens", "Geral") e
 * volume.
 *
 * Tolerância (§9.10): colunas são achadas pelo NOME do cabeçalho, sem acento e sem caixa, em
 * qualquer ordem; colunas extras são ignoradas. Linha com data inválida ou sem processo é
 * descartada e CONTADA — nunca some em silêncio.
 */

export interface Remessa {
  /** "YYYY-MM-DD" — texto, não Date, para não depender de fuso. */
  data: string;
  ano: number;
  mes: number;
  /** Chave do processo: "110/2026" (número sem zeros à esquerda / ano), ou o rótulo normalizado. */
  chave: string;
  rotulo: string;
  idEmail: string | null;
}

export interface ProcessoDemanda {
  chave: string;
  /** Rótulo mais recente da planilha (ex.: "Aquisição de Bens Nº 210/2025 - volume 1"). */
  rotulo: string;
  remessas: number;
  primeira: string;
  ultima: string;
}

export interface MesDemanda {
  mes: number;
  remessas: number;
  distintos: number;
}

export interface DemandaDivisao {
  ano: number;
  remessas: number;
  processosDistintos: number;
  /** Processos com mais de uma remessa. */
  processosQueVoltaram: number;
  /** Remessas além da primeira de cada processo. */
  remessasExtras: number;
  /** Remessas por processo, uma casa decimal. */
  mediaRemessas: number;
  /** De janeiro até o último mês com remessa; meses sem remessa aparecem com zero. */
  porMes: MesDemanda[];
  /** Mais recorrentes primeiro; empate pela chave, para a ordem não oscilar. */
  processos: ProcessoDemanda[];
  ultimaRemessa: string | null;
}

export interface LeituraRemessas {
  remessas: Remessa[];
  /** Linhas com data inválida ou sem processo. */
  descartadas: number;
  /** Mesma remessa repetida (mesmo e-mail e mesmo processo): contada uma vez. */
  duplicadas: number;
}

export type ResultadoLeitura = ({ ok: true } & LeituraRemessas) | { ok: false; motivo: string };

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "Aquisição de Bens Nº 210/2025 - volume 1" → "210/2025". Sem número: rótulo normalizado. */
export function chaveDoProcesso(rotulo: string): string {
  const m = /n[ºo°]\.?\s*(\d+)\s*\/\s*(\d{4})/i.exec(rotulo);
  if (m) return `${Number(m[1])}/${m[2]}`;
  return normalizar(rotulo);
}

function lerData(texto: string): { data: string; ano: number; mes: number } | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(texto);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  const dd = String(dia).padStart(2, "0");
  const mm = String(mes).padStart(2, "0");
  return { data: `${ano}-${mm}-${dd}`, ano, mes };
}

/**
 * Lê as linhas do CSV. Procura o cabeçalho (a primeira linha que tem "Data" e "Processo…") em vez de
 * assumir que é a primeira: a planilha pode ganhar título ou linhas em branco no topo.
 */
export function lerRemessas(linhas: string[][]): ResultadoLeitura {
  let cab = -1;
  let iData = -1;
  let iProcesso = -1;
  let iEmail = -1;
  for (let i = 0; i < linhas.length && i < 20; i++) {
    const nomes = linhas[i]!.map(normalizar);
    const d = nomes.findIndex((n) => n === "data");
    const p = nomes.findIndex((n) => n.includes("processo"));
    if (d !== -1 && p !== -1) {
      cab = i;
      iData = d;
      iProcesso = p;
      iEmail = nomes.findIndex((n) => n.startsWith("id") && n.includes("mail"));
      break;
    }
  }
  if (cab === -1) return { ok: false, motivo: "Cabeçalho não reconhecido: esperava as colunas Data e Processo." };

  const remessas: Remessa[] = [];
  const vistos = new Set<string>();
  let descartadas = 0;
  let duplicadas = 0;
  for (const linha of linhas.slice(cab + 1)) {
    if (linha.every((c) => c.trim() === "")) continue; // linha em branco não é remessa
    const rotulo = (linha[iProcesso] ?? "").trim();
    const data = lerData(linha[iData] ?? "");
    if (!rotulo || !data) {
      descartadas++;
      continue;
    }
    const chave = chaveDoProcesso(rotulo);
    const idEmail = iEmail === -1 ? null : (linha[iEmail] ?? "").trim() || null;
    if (idEmail) {
      // O mesmo e-mail pode encaminhar dois processos: a identidade é o PAR, não só o e-mail.
      const par = `${idEmail}|${chave}`;
      if (vistos.has(par)) {
        duplicadas++;
        continue;
      }
      vistos.add(par);
    }
    remessas.push({ data: data.data, ano: data.ano, mes: data.mes, chave, rotulo, idEmail });
  }
  return { ok: true, remessas, descartadas, duplicadas };
}

export function calcularDemanda(remessas: Remessa[], ano: number): DemandaDivisao {
  const doAno = remessas.filter((r) => r.ano === ano);
  const porProcesso = new Map<string, Remessa[]>();
  for (const r of doAno) {
    const lista = porProcesso.get(r.chave);
    if (lista) lista.push(r);
    else porProcesso.set(r.chave, [r]);
  }

  const processos: ProcessoDemanda[] = [...porProcesso.entries()].map(([chave, lista]) => {
    const ordenadas = [...lista].sort((a, b) => a.data.localeCompare(b.data));
    return {
      chave,
      rotulo: ordenadas[ordenadas.length - 1]!.rotulo,
      remessas: lista.length,
      primeira: ordenadas[0]!.data,
      ultima: ordenadas[ordenadas.length - 1]!.data,
    };
  });
  processos.sort((a, b) => b.remessas - a.remessas || a.chave.localeCompare(b.chave));

  const ultimoMes = doAno.reduce((m, r) => Math.max(m, r.mes), 0);
  const porMes: MesDemanda[] = [];
  for (let mes = 1; mes <= ultimoMes; mes++) {
    const doMes = doAno.filter((r) => r.mes === mes);
    porMes.push({ mes, remessas: doMes.length, distintos: new Set(doMes.map((r) => r.chave)).size });
  }

  const distintos = processos.length;
  return {
    ano,
    remessas: doAno.length,
    processosDistintos: distintos,
    processosQueVoltaram: processos.filter((p) => p.remessas > 1).length,
    remessasExtras: doAno.length - distintos,
    mediaRemessas: distintos === 0 ? 0 : Math.round((doAno.length / distintos) * 10) / 10,
    porMes,
    processos,
    ultimaRemessa: doAno.length === 0 ? null : doAno.map((r) => r.data).sort().pop()!,
  };
}
