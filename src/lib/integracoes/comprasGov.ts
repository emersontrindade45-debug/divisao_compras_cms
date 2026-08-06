import "server-only";
import type { CandidatoSimilaridade } from "@/lib/ia/types";
import { tokenizar, raizPlural } from "@/lib/similaridade/texto";

/**
 * Integração com a API de Dados Abertos do Compras.gov.br
 * (dadosabertos.compras.gov.br — módulos de pesquisa de preços e serviços).
 *
 * Estratégia de busca:
 * 1. Baixa o catálogo CATSER (3 014 itens de serviço) em paralelo e o guarda
 *    em cache de módulo para evitar o download em cada busca.
 * 2. Usa sobreposição de tokens para encontrar os serviços mais similares ao
 *    termo pesquisado.
 * 3. Consulta `modulo-pesquisa-preco/3_consultarServico` para cada código
 *    encontrado e devolve os preços homologados como `CandidatoSimilaridade`.
 *
 * Limitação conhecida: a API não oferece busca por texto livre. A matching é
 * feita localmente contra os nomes do catálogo CATSER. Para serviços de
 * limpeza/conservação predial, a cobertura é baixa (catálogo usa nomenclatura
 * técnica distinta da dos contratos). A integração agrega maior valor para
 * serviços com codificação CATSER bem estabelecida (TI, saúde, alimentação).
 *
 * Complemento ao PNCP: traz dados do SIASG/COMPRASNET (incluindo contratos
 * antes do PNCP se tornarem obrigatórios), com pipeline de dados independente.
 */

const BASE_URL = "https://dadosabertos.compras.gov.br";

// Catálogo de serviços tem 3 014 itens (500 por página = 7 páginas).
// Buscadas em paralelo o download leva ~1,5–2 s numa função serverless quente.
const CATALOGO_POR_PAGINA = 500;
const CATALOGO_MAX_PAGINAS = 10;

// Janela de recência: mesma do pipeline automático (IN 65/2021, serviços).
const JANELA_DIAS = 730;

// Quantos códigos CATSER consultar no máximo após o matching.
// Mais códigos → mais resultados candidatos, mas mais chamadas de rede.
const MAX_CODIGOS_BUSCAR = 4;

// Score mínimo de sobreposição de tokens para usar um código.
// 0 = qualquer overlap; 1 = todos os tokens do termo presentes no nome.
const SCORE_MINIMO_CATALOGO = 0.15;

// Resultados por página na consulta de preços.
const PRECOS_POR_PAGINA = 100;

const MAX_TENTATIVAS = 3;
const BACKOFF_BASE_MS = 800;

// ── Tipos da API ─────────────────────────────────────────────────────────────

interface ServicosCatalogo {
  codigoServico: number;
  nomeServico: string;
  nomeGrupo?: string | null;
  nomeClasse?: string | null;
  nomeSubclasse?: string | null;
}

interface RespostaPaginada<T> {
  resultado: T[];
  totalRegistros: number;
  totalPaginas: number;
  paginasRestantes: number;
}

interface PrecoPesquisaServico {
  descricaoItem: string;
  codigoItemCatalogo: number;
  nomeUnidadeMedida: string;
  siglaUnidadeMedida: string;
  quantidade: number;
  precoUnitario: number;
  niFornecedor: string;
  nomeFornecedor: string;
  codigoUasg: string;
  nomeUasg: string;
  codigoOrgao: number;
  nomeOrgao: string;
  dataCompra: string;
  dataResultado?: string | null;
}

// ── Cache de módulo ───────────────────────────────────────────────────────────

let catalogoCache: ServicosCatalogo[] | null = null;
let carregandoCache: Promise<ServicosCatalogo[]> | null = null;

// ── Utilitários ───────────────────────────────────────────────────────────────

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) return res.json() as Promise<T>;
      if (res.status < 500) {
        console.warn(`[ComprasGov] HTTP ${res.status}: ${url}`);
        return null;
      }
      if (tentativa === MAX_TENTATIVAS) return null;
      console.warn(`[ComprasGov] HTTP ${res.status} (tentativa ${tentativa}): ${url}`);
    } catch (err) {
      ultimoErro = err;
      if (tentativa === MAX_TENTATIVAS) throw ultimoErro;
      console.warn(`[ComprasGov] Rede (tentativa ${tentativa}): ${url}`, err);
    }
    await esperar(BACKOFF_BASE_MS * 2 ** (tentativa - 1));
  }
  return null;
}

// ── Catálogo de serviços ──────────────────────────────────────────────────────

/**
 * Baixa o catálogo CATSER em paralelo e mantém em cache de módulo.
 *
 * No ambiente serverless, o cache sobrevive entre invocações da mesma instância
 * (instâncias quentes), mas é descartado no cold start. O download paralelo de
 * todas as páginas leva ~1–2 s, aceitável num cold start de fundo.
 */
async function carregarCatalogoServicos(): Promise<ServicosCatalogo[]> {
  if (catalogoCache) return catalogoCache;
  if (carregandoCache) return carregandoCache;

  carregandoCache = (async () => {
    // Busca a primeira página para descobrir o total de páginas.
    const primeira = await fetchJSON<RespostaPaginada<ServicosCatalogo>>(
      `${BASE_URL}/modulo-servico/6_consultarItemServico?tamanhoPagina=${CATALOGO_POR_PAGINA}&statusServico=true&pagina=1`,
    );
    if (!primeira?.resultado?.length) {
      catalogoCache = [];
      return [];
    }

    const totalPaginas = Math.min(primeira.totalPaginas, CATALOGO_MAX_PAGINAS);
    const paginas = Array.from({ length: totalPaginas - 1 }, (_, i) => i + 2);

    const demaisPaginas = await Promise.all(
      paginas.map((p) =>
        fetchJSON<RespostaPaginada<ServicosCatalogo>>(
          `${BASE_URL}/modulo-servico/6_consultarItemServico?tamanhoPagina=${CATALOGO_POR_PAGINA}&statusServico=true&pagina=${p}`,
        ),
      ),
    );

    const todos: ServicosCatalogo[] = [...primeira.resultado];
    for (const pagina of demaisPaginas) {
      if (pagina?.resultado) todos.push(...pagina.resultado);
    }

    catalogoCache = todos;
    return todos;
  })();

  return carregandoCache;
}

// ── Matching de catálogo ──────────────────────────────────────────────────────

/**
 * Pontua um item do catálogo CATSER contra o termo de busca usando sobreposição
 * de tokens raizados (radical mínimo). Quanto mais tokens do termo aparecem no
 * nome/grupo/classe do serviço, maior o score (0–1).
 */
function scoreServico(tokensTermo: Set<string>, servico: ServicosCatalogo): number {
  if (tokensTermo.size === 0) return 0;

  const textoServico = [
    servico.nomeServico,
    servico.nomeSubclasse,
    servico.nomeClasse,
    servico.nomeGrupo,
  ]
    .filter(Boolean)
    .join(" ");

  const tokensServico = new Set(tokenizar(textoServico).map(raizPlural));

  let overlap = 0;
  for (const t of tokensTermo) {
    if (tokensServico.has(t)) overlap++;
  }

  return overlap / tokensTermo.size;
}

function encontrarServicos(
  termo: string,
  catalogo: ServicosCatalogo[],
): ServicosCatalogo[] {
  const tokensTermo = new Set(tokenizar(termo).map(raizPlural));

  return catalogo
    .map((s) => ({ s, score: scoreServico(tokensTermo, s) }))
    .filter(({ score }) => score >= SCORE_MINIMO_CATALOGO)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CODIGOS_BUSCAR)
    .map(({ s }) => s);
}

// ── Consulta de preços ────────────────────────────────────────────────────────

function dataRange(): { dataInicio: string; dataFim: string } {
  const dataFim = new Date();
  const dataInicio = new Date(dataFim.getTime() - JANELA_DIAS * 24 * 60 * 60 * 1000);
  return {
    dataFim: dataFim.toISOString().slice(0, 10),
    dataInicio: dataInicio.toISOString().slice(0, 10),
  };
}

async function buscarPrecosServico(
  codigoItemCatalogo: number,
): Promise<PrecoPesquisaServico[]> {
  const { dataInicio, dataFim } = dataRange();
  const url =
    `${BASE_URL}/modulo-pesquisa-preco/3_consultarServico` +
    `?codigoItemCatalogo=${codigoItemCatalogo}` +
    `&tamanhoPagina=${PRECOS_POR_PAGINA}` +
    `&dataCompraInicio=${dataInicio}` +
    `&dataCompraFim=${dataFim}`;

  const data = await fetchJSON<RespostaPaginada<PrecoPesquisaServico>>(url);
  return data?.resultado ?? [];
}

// ── Ponto de entrada público ──────────────────────────────────────────────────

/**
 * Busca preços de serviços no banco de dados do Compras.gov.br (SIASG/COMPRASNET)
 * para o termo informado.
 *
 * Complementa a busca do PNCP com dados históricos do COMPRASNET: inclui
 * compras realizadas antes da obrigatoriedade do PNCP e compras de órgãos
 * federais cuja publicação corre em paralelo nos dois sistemas.
 *
 * Devolve array vazio (silenciosamente) quando não há serviços catalogados
 * com sobreposição suficiente — não interrompe o pipeline principal.
 */
export async function buscarContratosComprasGov(
  termo: string,
): Promise<CandidatoSimilaridade[]> {
  if (!termo.trim()) return [];

  try {
    const catalogo = await carregarCatalogoServicos();
    const servicosMatch = encontrarServicos(termo, catalogo);

    if (servicosMatch.length === 0) return [];

    const precosPorServico = await Promise.all(
      servicosMatch.map((s) => buscarPrecosServico(s.codigoServico)),
    );

    const candidatos: CandidatoSimilaridade[] = [];
    const vistos = new Set<string>();

    for (const precos of precosPorServico) {
      for (const preco of precos) {
        if (!preco.precoUnitario || preco.precoUnitario <= 0) continue;

        // Usa dataResultado quando disponível (data do julgamento); fallback
        // para dataCompra (data de homologação registrada no COMPRASNET).
        const dataRef = new Date(preco.dataResultado ?? preco.dataCompra);
        if (isNaN(dataRef.getTime())) continue;

        // Deduplicação simples: mesma descrição + mesmo preço = mesmo resultado.
        const chave = `${preco.descricaoItem.slice(0, 80)}|${preco.precoUnitario}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);

        candidatos.push({
          tipoCandidato: "contratacao_publica",
          fonteDescricao: preco.descricaoItem,
          fonteOrgaoOuId: preco.nomeOrgao || preco.nomeUasg,
          // Sem URL direta: Compras.gov.br não expõe link por idCompra de forma
          // pública e estável. O usuário pode verificar pelo órgão + data.
          valorUnitario: preco.precoUnitario,
          dataReferencia: dataRef,
          unidade: preco.siglaUnidadeMedida || preco.nomeUnidadeMedida || "UN",
          quantidade: preco.quantidade || 1,
        });
      }
    }

    return candidatos;
  } catch (err) {
    console.error(`[ComprasGov] Erro ao buscar para "${termo}":`, err);
    return [];
  }
}
