import { normalizar } from "./texto";

/**
 * Pares de sinônimos comuns em licitações de serviços e materiais.
 * Cada grupo contém termos intercambiáveis: se o termo de busca contém
 * uma das palavras, as alternativas do mesmo grupo são adicionadas.
 */
const GRUPOS_SINONIMOS: string[][] = [
  ["lavagem", "limpeza", "higienizacao", "conservacao"],
  ["limpeza", "lavagem", "higienizacao", "conservacao"],
  ["higienizacao", "limpeza", "lavagem"],
  ["manutencao", "conservacao", "reparo", "reparacao"],
  ["conservacao", "manutencao", "reparacao"],
  ["fornecimento", "aquisicao", "compra", "suprimento"],
  ["aquisicao", "fornecimento", "compra"],
  ["instalacao", "montagem", "implantacao"],
  ["servico", "prestacao"],
  ["vidro", "vidros", "envidracado"],
  ["fachada", "fachadas", "parede externa"],
  ["cobertura", "telhado", "telha"],
  ["calha", "calhas", "drenagem"],
  ["calcada", "calcadas", "piso externo"],
  ["pintura", "repintura", "revestimento"],
  ["jardinagem", "paisagismo", "areas verdes"],
  ["desinsetizacao", "dedetizacao", "controle de pragas", "sanitizacao"],
  ["vigilancia", "seguranca patrimonial", "monitoramento"],
  ["copa", "alimentacao", "refeicao", "cantina"],
];

/** Normaliza sem acentos para comparação. */
function norm(s: string): string {
  return normalizar(s).replace(/\s+/g, " ").trim();
}

/**
 * Gera termos de busca alternativos substituindo a palavra-núcleo por sinônimos.
 * Retorna de 1 a 3 termos únicos (original + até 2 variações).
 */
export function expandirTermosBusca(termo: string): string[] {
  const termoNorm = norm(termo);
  const palavras = termoNorm.split(/\s+/);

  const termos = new Set<string>([termo]);

  for (const palavra of palavras) {
    const grupo = GRUPOS_SINONIMOS.find((g) => g.some((s) => norm(s) === palavra));
    if (!grupo) continue;

    // Substitui apenas a primeira ocorrência da palavra pelo sinônimo
    for (const sinonimo of grupo) {
      const sinNorm = norm(sinonimo);
      if (sinNorm === palavra) continue;
      const termoAlternativo = termoNorm.replace(new RegExp(`\\b${palavra}\\b`), sinNorm).trim();
      if (termoAlternativo && termoAlternativo !== termoNorm) {
        termos.add(termoAlternativo);
      }
      if (termos.size >= 3) break;
    }
    if (termos.size >= 3) break;
  }

  return [...termos].slice(0, 3);
}
