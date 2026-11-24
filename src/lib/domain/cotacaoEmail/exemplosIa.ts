/**
 * Exemplos anonimizados para a IA (M30.d): casos que a Divisão já decidiu ou conferiu, mostrados à
 * 1ª leitura como referência. Módulo PURO — não toca banco nem rede.
 *
 * Três garantias vivem aqui:
 *  - `parecerAnonimo`: o trecho que vai ser guardado não pode ter e-mail, telefone, documento, link
 *    ou valor. O script do Google já anonimiza; esta é a segunda trava, no nosso lado.
 *  - `escolherExemplos`: quais casos acompanham uma mensagem (os mais parecidos, com pelo menos um de
 *    cada classe quando houver).
 *  - o próprio caso nunca é exemplo dele mesmo (`excluirId`), que é o que torna a medição honesta.
 */

export const CLASSES_EXEMPLO = ["orcamento", "recusa", "duvida", "nao_e_resposta"] as const;
export type ClasseExemplo = (typeof CLASSES_EXEMPLO)[number];

/** Teto do trecho guardado. Mais que isto é texto demais para um exemplo. */
export const MAX_TRECHO_EXEMPLO = 600;
/** Quantos exemplos acompanham uma mensagem. */
export const MAX_EXEMPLOS_POR_ITEM = 4;
/** Semelhança mínima (0–1) para um caso valer como exemplo; abaixo disso é ruído. */
export const SEMELHANCA_MINIMA = 0.08;

export interface ExemploGuardado {
  /** Identidade do caso (id da mensagem); usada só para não escolher o caso como exemplo de si mesmo. */
  id: string;
  classe: ClasseExemplo;
  trecho: string;
}

export function ehClasseExemplo(valor: string): valor is ClasseExemplo {
  return (CLASSES_EXEMPLO as readonly string[]).includes(valor);
}

/**
 * A classe que uma decisão humana vira como exemplo. "A confirmar", "sem resposta" e e-mail devolvido
 * não são decisões sobre o conteúdo de uma resposta, então não viram exemplo.
 */
export function classeDaSituacao(situacao: string): ClasseExemplo | null {
  return situacao === "orcamento" || situacao === "recusa" || situacao === "duvida" ? situacao : null;
}

const PADROES_PROIBIDOS: Array<[string, RegExp]> = [
  ["email", /[\w.+-]+@[\w-]+\.[\w.-]+/],
  ["link", /(https?:\/\/|www\.)/i],
  ["documento", /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}/],
  ["telefone", /\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/],
  ["valor", /r\$\s*\d/i],
  ["numero_longo", /\d{8,}/],
];

export type AvaliacaoAnonimato = { ok: true } | { ok: false; motivo: string };

/**
 * O trecho pode ser guardado? Rejeita vazio, grande demais e qualquer coisa que ainda pareça dado
 * pessoal. Devolve o NOME da regra violada, nunca o trecho (o motivo pode ir a log).
 */
export function parecerAnonimo(trecho: string): AvaliacaoAnonimato {
  const t = trecho.trim();
  if (t.length < 8) return { ok: false, motivo: "curto_demais" };
  if (t.length > MAX_TRECHO_EXEMPLO) return { ok: false, motivo: "grande_demais" };
  for (const [nome, re] of PADROES_PROIBIDOS) if (re.test(t)) return { ok: false, motivo: nome };
  return { ok: true };
}

const PALAVRAS_VAZIAS = new Set([
  "para", "com", "uma", "que", "por", "dos", "das", "nos", "nas", "não", "nao", "mais", "como", "seu",
  "sua", "ser", "foi", "são", "sao", "tem", "ter", "isso", "esse", "essa", "este", "esta", "pelo",
  "pela", "aos", "ate", "até", "sobre", "favor", "email", "link", "doc", "tel", "valor", "nome",
]);

/** Palavras do texto sem acento, minúsculas, com 3+ letras e fora da lista de palavras vazias. */
export function palavrasDoTexto(texto: string): Set<string> {
  const limpo = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const saida = new Set<string>();
  for (const p of limpo.split(/[^a-z0-9]+/)) {
    if (p.length >= 3 && !PALAVRAS_VAZIAS.has(p) && !/^\d+$/.test(p)) saida.add(p);
  }
  return saida;
}

/** Semelhança de Jaccard entre dois conjuntos de palavras (0 = nada em comum, 1 = iguais). */
export function semelhanca(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let comuns = 0;
  for (const p of a) if (b.has(p)) comuns++;
  return comuns / (a.size + b.size - comuns);
}

export interface OpcoesEscolha {
  /** Caso a nunca usar como exemplo (o próprio caso lido). */
  excluirId?: string;
  max?: number;
}

/**
 * Os exemplos que acompanham `trecho`: os mais parecidos, garantindo UM de cada classe antes de
 * completar pelos próximos mais parecidos. Mostrar só a classe dominante empurraria a IA para ela.
 * Só entra caso com semelhança mínima; nada parecido = lista vazia (a IA lê sem exemplo).
 */
export function escolherExemplos(trecho: string, exemplos: ExemploGuardado[], opcoes: OpcoesEscolha = {}): ExemploGuardado[] {
  const max = opcoes.max ?? MAX_EXEMPLOS_POR_ITEM;
  const alvo = palavrasDoTexto(trecho);
  const pontuados = exemplos
    .filter((e) => e.id !== opcoes.excluirId)
    .map((e) => ({ e, s: semelhanca(alvo, palavrasDoTexto(e.trecho)) }))
    .filter((x) => x.s >= SEMELHANCA_MINIMA)
    .sort((x, y) => y.s - x.s || (x.e.id < y.e.id ? -1 : 1));

  const escolhidos: typeof pontuados = [];
  for (const classe of CLASSES_EXEMPLO) {
    const melhor = pontuados.find((x) => x.e.classe === classe);
    if (melhor && escolhidos.length < max) escolhidos.push(melhor);
  }
  for (const x of pontuados) {
    if (escolhidos.length >= max) break;
    if (!escolhidos.includes(x)) escolhidos.push(x);
  }
  return escolhidos.sort((x, y) => y.s - x.s || (x.e.id < y.e.id ? -1 : 1)).map((x) => x.e);
}
