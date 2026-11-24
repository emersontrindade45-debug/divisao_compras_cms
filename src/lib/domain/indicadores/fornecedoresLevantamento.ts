/**
 * Fornecedores e cotações por e-mail no painel de demanda (M30.e, etapa 4). Lê a aba "Por mês" da planilha do
 * Levantamento (Gmail → planilha, uma por ano) e resume o retorno dos fornecedores. Puro: recebe as linhas lidas.
 *
 * Retorno útil = recusa + dúvida sobre os destinatários contatados ("firme": a classificação foi conferida e acertou
 * 100% na amostra). Orçamento fica separado ("em validação": 6 de 10 na amostra, os erros tinham PDF anexo) — somar
 * os dois esconderia que uma das parcelas ainda não foi provada.
 */

export interface MesFornecedor {
  /** "2026-05" */
  mes: string;
  emails: number;
  destinatarios: number;
  orcamento: number;
  recusa: number;
  duvida: number;
  /** Só confirmaram recebimento / outra resposta. */
  outra: number;
  semResposta: number;
  enderecoErrado: number;
  devolvidoOutro: number;
}

export type LeituraPorMes =
  | { ok: true; meses: MesFornecedor[]; inconsistentes: string[] }
  | { ok: false; motivo: string };

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** "1.895" → 1895; "1895" → 1895; vazio ou texto → null. Contagens são inteiras, então o ponto é sempre milhar. */
export function inteiro(v: string | undefined): number | null {
  const s = (v ?? "").trim().replace(/\./g, "");
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}

const COLUNAS: { campo: keyof Omit<MesFornecedor, "mes">; casa: (n: string) => boolean }[] = [
  { campo: "emails", casa: (n) => n.includes("mail") && n.includes("enviado") },
  { campo: "destinatarios", casa: (n) => n.startsWith("destinatario") },
  { campo: "orcamento", casa: (n) => n === "orcamento" },
  { campo: "recusa", casa: (n) => n === "recusa" },
  { campo: "duvida", casa: (n) => n === "duvida" },
  { campo: "outra", casa: (n) => n.includes("confirmou") || n === "outra" },
  { campo: "semResposta", casa: (n) => n.startsWith("sem resposta") },
  { campo: "enderecoErrado", casa: (n) => n.startsWith("endereco errado") },
  { campo: "devolvidoOutro", casa: (n) => n.startsWith("devolvido") },
];

/** Soma das partes que o script classifica: tem de fechar com os destinatários de cada mês. */
export function somaDasPartes(m: MesFornecedor): number {
  return (
    m.orcamento + m.recusa + m.duvida + m.outra + m.semResposta + m.enderecoErrado + m.devolvidoOutro
  );
}

export function lerPorMes(linhas: string[][]): LeituraPorMes {
  let cab = -1;
  for (let i = 0; i < Math.min(linhas.length, 10); i++) {
    const nomes = linhas[i]!.map(semAcento);
    if (nomes.includes("mes") && nomes.some((n) => n.startsWith("destinatario"))) {
      cab = i;
      break;
    }
  }
  if (cab === -1)
    return { ok: false, motivo: "Cabeçalho não reconhecido: esperava as colunas Mês e Destinatários." };
  const nomes = linhas[cab]!.map(semAcento);
  const iMes = nomes.indexOf("mes");
  const indice = new Map<keyof Omit<MesFornecedor, "mes">, number>();
  for (const c of COLUNAS) {
    const i = nomes.findIndex(c.casa);
    if (i === -1) return { ok: false, motivo: `Coluna ausente na aba “Por mês”: ${c.campo}.` };
    indice.set(c.campo, i);
  }
  const meses: MesFornecedor[] = [];
  const inconsistentes: string[] = [];
  for (const linha of linhas.slice(cab + 1)) {
    const mes = (linha[iMes] ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(mes)) continue; // linha em branco ou de total
    const m = { mes } as MesFornecedor;
    let valida = true;
    for (const [campo, i] of indice) {
      const n = inteiro(linha[i]);
      if (n === null) {
        valida = false;
        break;
      }
      m[campo] = n;
    }
    if (!valida) return { ok: false, motivo: `Linha de ${mes} com valor que não é número.` };
    if (somaDasPartes(m) !== m.destinatarios) inconsistentes.push(mes);
    meses.push(m);
  }
  if (meses.length === 0) return { ok: false, motivo: "A aba “Por mês” não tem nenhum mês." };
  return { ok: true, meses: meses.sort((a, b) => a.mes.localeCompare(b.mes)), inconsistentes };
}

export interface ResumoFornecedores {
  ano: number;
  meses: MesFornecedor[];
  emails: number;
  destinatarios: number;
  orcamento: number;
  recusa: number;
  duvida: number;
  outra: number;
  semResposta: number;
  enderecoErrado: number;
  devolvidoOutro: number;
  /** (recusa + dúvida) ÷ destinatários; null sem destinatários. */
  retornoFirme: number | null;
  /** orçamento ÷ destinatários — separado porque a classe ainda está em validação. */
  retornoOrcamento: number | null;
  /** Mês com mais endereços errados (null se nenhum teve). */
  picoEnderecoErrado: { mes: string; quantidade: number } | null;
}

/** Resume um ano; null quando a planilha não tem mês desse ano (não inventar zero). */
export function resumirFornecedores(meses: MesFornecedor[], ano: number): ResumoFornecedores | null {
  const doAno = meses.filter((m) => m.mes.startsWith(`${ano}-`));
  if (doAno.length === 0) return null;
  const soma = (f: (m: MesFornecedor) => number) => doAno.reduce((s, m) => s + f(m), 0);
  const destinatarios = soma((m) => m.destinatarios);
  const recusa = soma((m) => m.recusa);
  const duvida = soma((m) => m.duvida);
  const orcamento = soma((m) => m.orcamento);
  const pico = doAno.reduce((a, b) => (b.enderecoErrado > a.enderecoErrado ? b : a));
  return {
    ano,
    meses: doAno,
    emails: soma((m) => m.emails),
    destinatarios,
    orcamento,
    recusa,
    duvida,
    outra: soma((m) => m.outra),
    semResposta: soma((m) => m.semResposta),
    enderecoErrado: soma((m) => m.enderecoErrado),
    devolvidoOutro: soma((m) => m.devolvidoOutro),
    retornoFirme: destinatarios > 0 ? (recusa + duvida) / destinatarios : null,
    retornoOrcamento: destinatarios > 0 ? orcamento / destinatarios : null,
    picoEnderecoErrado:
      pico.enderecoErrado > 0 ? { mes: pico.mes, quantidade: pico.enderecoErrado } : null,
  };
}
