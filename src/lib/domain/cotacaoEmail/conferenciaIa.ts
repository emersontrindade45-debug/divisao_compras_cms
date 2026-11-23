import type { ClasseResposta } from "./criterioIa";

/**
 * Conferência das classificações da IA (M30.d): o analista abre a resposta no Gmail e diz qual era a
 * classe certa. Este módulo é PURO: decide a ordem da amostra e calcula a taxa de acerto. Nada aqui
 * toca em banco nem em texto de e-mail.
 */

export const CLASSES: readonly ClasseResposta[] = ["orcamento", "recusa", "duvida", "nao_e_resposta"];

export const ROTULO_CLASSE: Record<ClasseResposta, string> = {
  orcamento: "orçamento",
  recusa: "recusa",
  duvida: "dúvida",
  nao_e_resposta: "não é resposta",
};

export function ehClasse(v: unknown): v is ClasseResposta {
  return typeof v === "string" && (CLASSES as readonly string[]).includes(v);
}

/** FNV-1a de 32 bits: espalha ids parecidos (o Gmail os gera quase em sequência). */
function hash(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Ordem ESTÁVEL e pseudoaleatória: o mesmo conjunto sai na mesma ordem a cada abertura da tela, sem
 * guardar estado. Amostra tirada do topo desta ordem não é enviesada por data nem por processo — e é
 * isso que permite ler a taxa de acerto como estimativa da população. Desempate pelo id.
 */
export function ordenarAmostra<T extends { gmailMensagemId: string }>(itens: readonly T[]): T[] {
  return [...itens].sort((a, b) => {
    const d = hash(a.gmailMensagemId) - hash(b.gmailMensagemId);
    return d !== 0 ? d : a.gmailMensagemId < b.gmailMensagemId ? -1 : 1;
  });
}

export interface LinhaConferida {
  classeIa: string;
  confianca: string;
  /** A IA aplicou o veredito na consulta (afeta o dashboard) ou ficou só como sugestão. */
  aplicada: boolean;
  classeCorreta: string;
}

export interface Taxa {
  conferidas: number;
  certas: number;
  /** 0–1; null sem conferência (nunca 0%: "sem dado" não é "tudo errado"). */
  taxa: number | null;
  /** Intervalo de Wilson a 95%; null sem conferência. */
  intervalo: { de: number; ate: number } | null;
}

/**
 * Intervalo de Wilson a 95%. Com amostra pequena a taxa sozinha engana (3 de 3 = 100%): o intervalo
 * mostra o quanto ela ainda pode variar.
 */
export function calcularTaxa(certas: number, conferidas: number): Taxa {
  if (conferidas <= 0) return { conferidas: 0, certas: 0, taxa: null, intervalo: null };
  const z = 1.96;
  const p = certas / conferidas;
  const z2 = z * z;
  const centro = (p + z2 / (2 * conferidas)) / (1 + z2 / conferidas);
  const meia = (z * Math.sqrt((p * (1 - p)) / conferidas + z2 / (4 * conferidas * conferidas))) / (1 + z2 / conferidas);
  return {
    conferidas,
    certas,
    taxa: p,
    intervalo: { de: Math.max(0, centro - meia), ate: Math.min(1, centro + meia) },
  };
}

export interface ResumoConferencia {
  geral: Taxa;
  /** Pela classe que a IA deu. */
  porClasse: Record<string, Taxa>;
  /** Pela confiança que a IA declarou (alta/media/baixa). */
  porConfianca: Record<string, Taxa>;
  /** Só as que a IA aplicou na consulta: é a taxa que protege o dashboard. */
  aplicadas: Taxa;
  /** Erros mais comuns: "IA disse X, era Y". */
  confusoes: { classeIa: string; classeCorreta: string; quantidade: number }[];
}

function agrupar(linhas: readonly LinhaConferida[], chave: (l: LinhaConferida) => string): Record<string, Taxa> {
  const acc = new Map<string, { certas: number; total: number }>();
  for (const l of linhas) {
    const k = chave(l);
    const a = acc.get(k) ?? { certas: 0, total: 0 };
    a.total++;
    if (l.classeIa === l.classeCorreta) a.certas++;
    acc.set(k, a);
  }
  return Object.fromEntries([...acc.entries()].map(([k, a]) => [k, calcularTaxa(a.certas, a.total)]));
}

export function resumirConferencias(linhas: readonly LinhaConferida[]): ResumoConferencia {
  const certas = (ls: readonly LinhaConferida[]) => ls.filter((l) => l.classeIa === l.classeCorreta).length;
  const aplicadas = linhas.filter((l) => l.aplicada);

  const erros = new Map<string, { classeIa: string; classeCorreta: string; quantidade: number }>();
  for (const l of linhas) {
    if (l.classeIa === l.classeCorreta) continue;
    const k = `${l.classeIa}>${l.classeCorreta}`;
    const e = erros.get(k) ?? { classeIa: l.classeIa, classeCorreta: l.classeCorreta, quantidade: 0 };
    e.quantidade++;
    erros.set(k, e);
  }

  return {
    geral: calcularTaxa(certas(linhas), linhas.length),
    porClasse: agrupar(linhas, (l) => l.classeIa),
    porConfianca: agrupar(linhas, (l) => l.confianca),
    aplicadas: calcularTaxa(certas(aplicadas), aplicadas.length),
    confusoes: [...erros.values()].sort((a, b) => b.quantidade - a.quantidade || (a.classeIa + a.classeCorreta).localeCompare(b.classeIa + b.classeCorreta)),
  };
}
