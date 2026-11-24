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

/**
 * Todo processo passa pela Divisão obrigatoriamente 3 vezes quando não há erro. Só a 4ª passagem em
 * diante é devolução (recorrência real) — decisão do usuário em 2026-11-23: das remessas extras de cada
 * processo, 2 são duplicidade esperada e saem da contagem.
 */
export const PASSAGENS_OBRIGATORIAS = 3;

/** Recorrências (devoluções) de um processo: remessas além das passagens obrigatórias, nunca negativo. */
export function recorrenciasDoProcesso(remessas: number): number {
  return Math.max(0, remessas - PASSAGENS_OBRIGATORIAS);
}

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

interface LinhaLida {
  data: { data: string; ano: number; mes: number };
  rotulo: string;
  idEmail: string | null;
}

/** Linha da tabela principal: colunas achadas pelo cabeçalho; a data é só dd/mm/aaaa. */
function lerPeloCabecalho(linha: string[], iData: number, iProcesso: number, iEmail: number): LinhaLida | null {
  const rotulo = (linha[iProcesso] ?? "").trim();
  const data = lerData(linha[iData] ?? "");
  if (!rotulo || !data) return null;
  return { data, rotulo, idEmail: iEmail === -1 ? null : (linha[iEmail] ?? "").trim() || null };
}

/**
 * Tabela que a atualização horária da planilha escreveu ABAIXO da principal, sem cabeçalho (vista em
 * 2026-11-19: 500 linhas, as mais recentes primeiro): [ID Remessa, "dd/mm/aaaa hh:mm", Mês,
 * Processo, ID do E-mail]. Sem ela o dashboard fica parado na data da tabela principal. A forma é
 * conferida inteira (ID numérico, data com hora válida, processo e e-mail preenchidos) — linha de
 * outro formato, como o registro bruto de e-mails que vem junto, NÃO passa por aqui e é contada
 * como descartada em vez de virar remessa errada.
 */
function lerTabelaSemCabecalho(linha: string[]): LinhaLida | null {
  const [idRemessa, dataHora, , processo, idEmail] = linha.map((c) => c.trim());
  if (!idRemessa || !/^\d+$/.test(idRemessa)) return null;
  const m = /^(\d{1,2}\/\d{1,2}\/\d{4})\s+\d{1,2}:\d{2}$/.exec(dataHora ?? "");
  const data = m ? lerData(m[1]!) : null;
  if (!data || !processo || !idEmail) return null;
  return { data, rotulo: processo, idEmail };
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
    const lida =
      lerPeloCabecalho(linha, iData, iProcesso, iEmail) ?? lerTabelaSemCabecalho(linha);
    if (!lida) {
      descartadas++;
      continue;
    }
    const { data, rotulo, idEmail } = lida;
    const chave = chaveDoProcesso(rotulo);
    if (idEmail) {
      // O mesmo e-mail pode encaminhar dois processos: a identidade é o PAR, não só o e-mail. É também
      // o que junta a mesma remessa vista em duas tabelas da aba (ver `lerTabelaSemCabecalho`).
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
