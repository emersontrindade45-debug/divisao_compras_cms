import "server-only";
import { db } from "@/lib/db";
import type { CandidatoSimilaridade } from "@/lib/ia/types";
import { tokenizar, raizPlural } from "./texto";

/**
 * Provedor de busca pública sobre `PrecoReferencia` da fonte "sinapi" (M17,
 * docs/ApiPlan.md) — diferente do provedor Compras.gov (M16), não faz
 * nenhuma chamada de rede: os dados já foram ingeridos localmente
 * (`src/lib/ingestao/ingerirSinapi.ts`) e a consulta é direta ao Postgres.
 *
 * Matching por texto livre sobre `descricaoNormalizada`, mesmo princípio de
 * duas fases de `matchingCatalogoLocal.ts` (token mais distintivo filtra no
 * banco, pontuação por sobreposição de tokens ordena em memória) — mas aqui
 * a linha já **é** o candidato final (tem preço), não um código intermediário
 * que ainda precisa de uma segunda consulta.
 */

// Mesmo teto de `matchingCatalogoLocal.ts` — grande o bastante para não
// perder candidato relevante quando o token mais distintivo ainda é comum,
// pequeno o bastante para nunca aproximar o tamanho da tabela inteira.
const MAX_CANDIDATOS_QUERY = 400;

// Quantos candidatos devolver, no máximo, depois de pontuados.
const MAX_CANDIDATOS_RETORNO = 10;

/** Token não-trivial mais longo do termo — heurística de "substantivo-núcleo". */
function tokenMaisDistintivo(termo: string): string | null {
  const tokens = tokenizar(termo);
  if (tokens.length === 0) return null;
  return tokens.reduce((maior, atual) => (atual.length > maior.length ? atual : maior));
}

function pontuarSobreposicao(tokensTermo: Set<string>, descricaoNormalizada: string): number {
  if (tokensTermo.size === 0) return 0;
  const tokensCandidato = new Set(tokenizar(descricaoNormalizada).map(raizPlural));
  let overlap = 0;
  for (const token of tokensTermo) {
    if (tokensCandidato.has(token)) overlap++;
  }
  return overlap;
}

interface LinhaPrecoReferencia {
  descricao: string;
  descricaoNormalizada: string;
  unidade: string;
  valorUnitario: { toNumber: () => number };
  dataReferencia: Date;
  urlEvidencia: string | null;
  competencia: string;
  regime: string;
  metadados: unknown;
}

/** Extrai `localidade` de `metadados` (JSON livre) com fallback seguro — nunca lança. */
function extrairLocalidade(metadados: unknown): string {
  if (metadados && typeof metadados === "object" && "localidade" in metadados) {
    const valor = (metadados as { localidade?: unknown }).localidade;
    if (typeof valor === "string" && valor.trim()) return valor;
  }
  return "não informada";
}

const REGIMES_VALIDOS = new Set(["desonerado", "nao_desonerado"]);

/**
 * Sem `urlEvidencia`, o candidato não pode alimentar a estimativa
 * (CLAUDE.md §9.8) — nunca deveria acontecer para o SINAPI depois do
 * `normalizarLinhaSinapi` preencher o portal oficial por padrão, mas a
 * guarda fica explícita para não depender silenciosamente dessa garantia.
 */
function mapearParaCandidato(linha: LinhaPrecoReferencia): CandidatoSimilaridade | null {
  if (!linha.urlEvidencia) return null;

  return {
    tipoCandidato: "preco_referencia",
    fonteDescricao: linha.descricao,
    fonteOrgaoOuId: "SINAPI (Caixa Econômica Federal)",
    fonteUrl: linha.urlEvidencia,
    valorUnitario: linha.valorUnitario.toNumber(),
    dataReferencia: linha.dataReferencia,
    unidade: linha.unidade,
    quantidade: 1,
    // Sem competência/regime/localidade explícitos, dois preços legítimos do
    // mesmo código (desonerado x não-desonerado) se misturariam na série sem
    // distinção visível (CLAUDE.md §5, densidade informacional) — só omite o
    // bloco se o regime gravado não for um dos dois valores conhecidos
    // (dado legado/corrompido), nunca inventa um valor.
    ...(REGIMES_VALIDOS.has(linha.regime)
      ? {
          metadadosPrecoReferencia: {
            competencia: linha.competencia,
            regime: linha.regime as "desonerado" | "nao_desonerado",
            localidade: extrairLocalidade(linha.metadados),
          },
        }
      : {}),
  };
}

/**
 * Devolve candidatos de similaridade do SINAPI (Composições Sintético) para
 * um termo de busca livre. Só a **competência mais recente por código**
 * entra no resultado (`orderBy: competencia desc` + de-duplicação em
 * memória por `codigo`) — sem isso, um código ingerido em várias
 * competências apareceria repetido na série de preços com valores de meses
 * diferentes.
 *
 * Devolve `[]` sem lançar quando: termo sem token utilizável, tabela vazia
 * (ingestão real do SINAPI ainda não rodou), termo sem correspondência
 * textual, ou erro de banco — mesmo espírito de no-op seguro dos demais
 * provedores do registry (`buscarCandidatosComprasGovContratacoes`).
 */
export async function buscarCandidatosSinapi(termo: string): Promise<CandidatoSimilaridade[]> {
  if (!termo.trim()) return [];

  const tokenBusca = tokenMaisDistintivo(termo);
  if (!tokenBusca) return [];

  try {
    const linhas = await db.precoReferencia.findMany({
      where: {
        fonteReferencia: { chave: "sinapi" },
        descricaoNormalizada: { contains: tokenBusca, mode: "insensitive" },
      },
      select: {
        codigo: true,
        descricao: true,
        descricaoNormalizada: true,
        unidade: true,
        valorUnitario: true,
        dataReferencia: true,
        competencia: true,
        urlEvidencia: true,
        regime: true,
        metadados: true,
      },
      orderBy: { competencia: "desc" },
      take: MAX_CANDIDATOS_QUERY,
    });

    if (linhas.length === 0) return [];

    // Só a competência mais recente por código: como a query já vem ordenada
    // por competência decrescente, a primeira ocorrência de cada código é a
    // mais recente — um Map preserva essa primeira ocorrência e descarta as
    // demais.
    const maisRecentePorCodigo = new Map<string, (typeof linhas)[number]>();
    for (const linha of linhas) {
      if (!maisRecentePorCodigo.has(linha.codigo)) {
        maisRecentePorCodigo.set(linha.codigo, linha);
      }
    }

    const tokensTermo = new Set(tokenizar(termo).map(raizPlural));

    const pontuados = [...maisRecentePorCodigo.values()]
      .map((linha) => ({
        linha,
        score: pontuarSobreposicao(tokensTermo, linha.descricaoNormalizada),
      }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATOS_RETORNO);

    return pontuados
      .map((c) => mapearParaCandidato(c.linha))
      .filter((c): c is CandidatoSimilaridade => c !== null);
  } catch (err) {
    console.error(`[ProvedorSinapi] Erro inesperado ao buscar candidatos para "${termo}":`, err);
    return [];
  }
}
