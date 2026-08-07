import "server-only";
import { db } from "@/lib/db";
import { tokenizar, raizPlural } from "./texto";

/**
 * Matching de termo de busca livre contra o catálogo CATMAT ingerido em
 * `ItemCatalogoReferencia` (docs/ApiPlan.md §4.2) — necessário porque
 * `buscarItensContratacoesCompraGov` (`comprasGovContratacoes.ts`) só filtra
 * por `codItemCatalogo`/`codigoClasse`: a API do Compras.gov não tem busca
 * por texto livre (spike do M16, docs/ApiPlan.md §4.1e).
 *
 * Estratégia (duas fases, para não trazer a tabela inteira para a memória):
 * 1. Um `WHERE descricaoNormalizada ILIKE '%token%'` filtra candidatos no
 *    banco, usando o token mais distintivo do termo (o mais longo — heurística
 *    simples: token curto como "de"/"tipo" já é descartado por `tokenizar`,
 *    que exige >2 letras, mas entre os que sobram o mais longo tende a ser o
 *    substantivo-núcleo, não um qualificador genérico). `take` limitado evita
 *    trazer a tabela inteira quando o token for muito genérico (ex. "papel").
 * 2. Os candidatos trazidos são pontuados em memória por sobreposição de
 *    tokens contra o termo completo (mesmo princípio de
 *    `ordenarPorSobreposicaoLexical` em `sobreposicaoLexical.ts`, reescrito
 *    aqui porque a entrada é linha de catálogo, não `CandidatoSimilaridade` —
 *    não vale forçar o tipo só para reusar a função).
 *
 * Sem índice de trigram/full-text (não existe um configurado no schema —
 * `ItemCatalogoReferencia` só tem `@@index([descricaoNormalizada])`, que serve
 * para o `ILIKE` com prefixo mas não acelera `%token%` no meio da string).
 * Aceitável como primeira versão: não é o gargalo mais provável hoje — a
 * chamada de rede ao Compras.gov (22-40s a frio, spike §4.1e) é ordens de
 * magnitude mais lenta que este `SELECT` limitado. Não adicionar `pg_trgm`
 * sem medir que este passo é, de fato, o gargalo (CLAUDE.md — evitar
 * otimização prematura sem evidência).
 */

const FONTE_CATMAT = "catmat";

// Teto de linhas trazidas do banco para pontuação em memória — grande o
// bastante para não perder candidato relevante quando o token mais
// distintivo ainda é razoavelmente comum, pequeno o bastante para nunca
// aproximar o tamanho da tabela inteira (343.880 linhas — docs/ApiPlan.md §4.1e).
const MAX_CANDIDATOS_QUERY = 400;

// Quantos códigos CATMAT devolver, no máximo, depois de pontuados.
const MAX_CODIGOS_RETORNO = 5;

export interface OpcoesMatchingCatalogoLocal {
  /** Default `MAX_CODIGOS_RETORNO`. */
  maxResultados?: number;
}

/** Token não-trivial mais longo do termo — heurística de "substantivo-núcleo" (ver cabeçalho do arquivo). */
function tokenMaisDistintivo(termo: string): string | null {
  const tokens = tokenizar(termo);
  if (tokens.length === 0) return null;
  return tokens.reduce((maior, atual) => (atual.length > maior.length ? atual : maior));
}

/** Pontuação por sobreposição de tokens (raizados) entre o termo de busca e a descrição do catálogo. */
function pontuarSobreposicao(tokensTermo: Set<string>, descricaoNormalizada: string): number {
  if (tokensTermo.size === 0) return 0;
  const tokensCandidato = new Set(tokenizar(descricaoNormalizada).map(raizPlural));
  let overlap = 0;
  for (const token of tokensTermo) {
    if (tokensCandidato.has(token)) overlap++;
  }
  return overlap;
}

/**
 * Devolve até `opcoes.maxResultados` códigos CATMAT (`ItemCatalogoReferencia.codigo`)
 * cuja descrição melhor casa com `termo`, ordenados por pontuação decrescente.
 *
 * Devolve `[]` rapidamente, sem lançar, quando:
 * - o termo não gera nenhum token utilizável;
 * - a query no banco não traz nenhuma linha (tabela vazia — ingestão real do
 *   catálogo ainda não rodou em produção — ou termo sem correspondência
 *   textual nenhuma) — loga um aviso de diagnóstico para distinguir os dois
 *   casos depois, sem tratar nenhum deles como erro;
 * - nenhuma linha trazida tem sobreposição de tokens > 0 com o termo completo.
 */
export async function encontrarCodigosCatalogoLocal(
  termo: string,
  opcoes: OpcoesMatchingCatalogoLocal = {},
): Promise<number[]> {
  if (!termo.trim()) return [];

  const tokenBusca = tokenMaisDistintivo(termo);
  if (!tokenBusca) return [];

  const linhas = await db.itemCatalogoReferencia.findMany({
    where: {
      fonteChave: FONTE_CATMAT,
      ativo: true,
      descricaoNormalizada: { contains: tokenBusca, mode: "insensitive" },
    },
    select: { codigo: true, descricaoNormalizada: true },
    take: MAX_CANDIDATOS_QUERY,
  });

  if (linhas.length === 0) {
    console.warn(
      `[MatchingCatalogoLocal] Nenhum item do catálogo CATMAT casou com "${termo}" (token ` +
        `"${tokenBusca}"). Se a tabela ainda estiver vazia, rode a ingestão ` +
        "(scripts/ingerir-catalogo-compras-gov.ts catmat); se já estiver populada, o termo " +
        "simplesmente não tem correspondência textual no catálogo.",
    );
    return [];
  }

  const tokensTermo = new Set(tokenizar(termo).map(raizPlural));

  const pontuados = linhas
    .map((linha) => ({
      codigo: linha.codigo,
      score: pontuarSobreposicao(tokensTermo, linha.descricaoNormalizada),
    }))
    .filter((candidato) => candidato.score > 0)
    .sort((a, b) => b.score - a.score);

  return pontuados.slice(0, opcoes.maxResultados ?? MAX_CODIGOS_RETORNO).map((c) => c.codigo);
}
