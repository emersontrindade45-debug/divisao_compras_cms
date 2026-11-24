import { CLASSES_EXEMPLO, type ClasseExemplo } from "./exemplosIa";

/**
 * Medição dos exemplos da IA (M30.d): a MESMA primeira leitura, sem e com exemplos, contra a classe
 * que a Divisão decidiu. Decide se `IA_EXEMPLOS=1` pode ser ligada. Módulo PURO.
 *
 * Duas regras de método que vêm das lições do projeto:
 *  - só conta o caso lido nas DUAS versões (§9.87): leitura que falhou numa delas sairia da conta de
 *    uma e não da outra, e a comparação deixaria de ser entre as mesmas mensagens;
 *  - o caso nunca é exemplo de si mesmo (feito por quem monta os casos, não aqui).
 */

export interface CasoMedido {
  id: string;
  classeCorreta: ClasseExemplo;
  /** Classe que a 1ª leitura deu SEM exemplos; null = a leitura falhou. */
  semExemplos: ClasseExemplo | null;
  /** Classe que a 1ª leitura deu COM exemplos; null = a leitura falhou. */
  comExemplos: ClasseExemplo | null;
}

export interface Placar {
  total: number;
  semCertos: number;
  comCertos: number;
}

export interface ResultadoMedicao {
  geral: Placar;
  porClasse: Record<ClasseExemplo, Placar>;
  /** Errava sem exemplo e passou a acertar. */
  melhoraram: string[];
  /** Acertava sem exemplo e passou a errar: é o que o exemplo ESTRAGOU. */
  pioraram: string[];
  /** Casos fora da conta porque uma das leituras falhou. */
  indeterminados: number;
  veredito: { podeLigar: boolean; motivos: string[] };
}

/** Amostra mínima para se decidir alguma coisa; abaixo disso o veredito é "ainda não". */
export const AMOSTRA_MINIMA = 30;
/** Classe com menos casos que isto não tem veredito próprio (um caso a mais ou a menos vira 20%). */
export const CASOS_MINIMOS_POR_CLASSE = 5;

const vazio = (): Placar => ({ total: 0, semCertos: 0, comCertos: 0 });

export function compararAcerto(casos: CasoMedido[]): ResultadoMedicao {
  const geral = vazio();
  const porClasse = Object.fromEntries(CLASSES_EXEMPLO.map((c) => [c, vazio()])) as Record<ClasseExemplo, Placar>;
  const melhoraram: string[] = [];
  const pioraram: string[] = [];
  let indeterminados = 0;

  for (const c of casos) {
    if (c.semExemplos === null || c.comExemplos === null) {
      indeterminados++;
      continue;
    }
    const semCerto = c.semExemplos === c.classeCorreta;
    const comCerto = c.comExemplos === c.classeCorreta;
    for (const p of [geral, porClasse[c.classeCorreta]]) {
      p.total++;
      if (semCerto) p.semCertos++;
      if (comCerto) p.comCertos++;
    }
    if (!semCerto && comCerto) melhoraram.push(c.id);
    if (semCerto && !comCerto) pioraram.push(c.id);
  }

  const motivos: string[] = [];
  if (geral.total < AMOSTRA_MINIMA) motivos.push(`amostra pequena demais (${geral.total} casos lidos nas duas versões; mínimo ${AMOSTRA_MINIMA})`);
  if (geral.comCertos < geral.semCertos) motivos.push(`o acerto geral piorou (${geral.semCertos} → ${geral.comCertos} de ${geral.total})`);
  for (const classe of CLASSES_EXEMPLO) {
    const p = porClasse[classe];
    if (p.total >= CASOS_MINIMOS_POR_CLASSE && p.comCertos < p.semCertos) {
      motivos.push(`a classe ${classe} piorou (${p.semCertos} → ${p.comCertos} de ${p.total})`);
    }
  }
  return { geral, porClasse, melhoraram, pioraram, indeterminados, veredito: { podeLigar: motivos.length === 0, motivos } };
}
