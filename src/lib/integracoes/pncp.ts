import "server-only";
import type { CandidatoSimilaridade } from "@/lib/ia/types";
import { cnpjOrgaoProprio, normalizarCnpj } from "@/lib/domain/orgaoProprio";
import { tokenizar, raizPlural } from "@/lib/similaridade/texto";
import { processarComConcorrencia } from "@/lib/similaridade/processarComConcorrencia";

const PNCP_SEARCH_BASE_URL = "https://pncp.gov.br/api/search";
const PNCP_ITENS_BASE_URL = "https://pncp.gov.br/pncp-api/v1";

const TAMANHO_PAGINA = 20;

// O PNCP derruba conexões (ECONNRESET) ou responde 429 sob rajadas de requisições —
// comum ao processar cotações com muitos itens, cada um exigindo ≥3 preços. Retry com
// backoff absorve o throttling transitório; o lote limita a rajada de buscas de itens.
const MAX_TENTATIVAS = 3;
const BACKOFF_BASE_MS = 1000;
const LOTE_BUSCA_ITENS = 5;

/**
 * Timeout por requisição. **Sem ele o `fetch` do Node herda o padrão do undici,
 * que é de 300s por fase** — uma única requisição pendurada consome sozinha todo
 * o `maxDuration` da função serverless, e no assistente isso mata o stream SSE
 * no meio (o cliente fica com o passo girando para sempre).
 *
 * 10s é folga larga sobre a latência real medida contra a API em 2026-08-10:
 * ~2,5s na busca textual, ~1,4s por página de `/itens`, ~47ms em `/resultados`.
 * O corte precisa ser generoso o bastante para não descartar resposta lenta
 * legítima, e curto o bastante para o retry ainda caber no orçamento do turno.
 */
const TIMEOUT_REQUISICAO_MS = 10_000;

/**
 * Teto de tempo da busca inteira. O timeout por requisição não basta: o custo
 * agregado é que estoura o orçamento — 82 requisições HTTP numa única busca,
 * medido em 2026-08-10, e isso com apenas 7 editais dos 20 que a busca textual
 * pode devolver.
 *
 * Verificado ENTRE lotes, nunca no meio de um: abortar um lote pela metade
 * desperdiçaria requisições já pagas e devolveria candidatos de um subconjunto
 * arbitrário dos itens de uma compra. Devolver menos editais, todos completos, é
 * preferível — o assistente pode refinar o termo no turno seguinte.
 */
const TEMPO_MAX_BUSCA_MS = 20_000;

// **O padrão de `/itens` é 10 registros por página** — medido contra a API real em
// 2026-07-30, não documentado. Sem paginar, toda contratação com mais de 10 itens era
// truncada no décimo em silêncio: numa compra de 418 itens, enxergávamos 2,4% dela.
// 500 é o teto que a API aceita.
const ITENS_TAMANHO_PAGINA = 500;
// Trava de segurança contra paginação infinita se a API mudar de contrato.
const ITENS_MAX_PAGINAS = 20;

// Cada item relevante custa uma requisição a mais (o valor homologado vive em endpoint
// separado). O teto evita que uma única compra gigante monopolize o orçamento de tempo
// da função serverless.
const LOTE_BUSCA_RESULTADOS = 5;
const MAX_ITENS_RELEVANTES_POR_COMPRA = 40;

// A exclusão do próprio órgão (IN 65/2021, CLAUDE.md §9.9) mora em
// `domain/orgaoProprio.ts`. Ela saiu daqui para virar fonte única: enquanto era
// privada deste módulo, qualquer fonte nova — como a busca web do assistente
// (M13) — nascia sem a regra.

/** Monta a URL do edital no portal PNCP: /app/editais/{cnpj}/{ano}/{sequencial}. */
function montarUrlEdital(processo: PNCPSearchItem): string {
  return `https://pncp.gov.br/app/editais/${processo.orgao_cnpj}/${processo.ano}/${processo.numero_sequencial}`;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchComRetry(url: string): Promise<Response> {
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      // Sinal novo a cada tentativa: um `AbortSignal.timeout` já disparado
      // aborta a requisição seguinte instantaneamente, anulando o retry.
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_REQUISICAO_MS),
      });
      const retryavel = res.status === 429 || res.status >= 500;
      if (res.ok || !retryavel || tentativa === MAX_TENTATIVAS) return res;
      console.warn(`[PNCP] HTTP ${res.status} (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${url}`);
    } catch (err) {
      ultimoErro = err;
      if (tentativa === MAX_TENTATIVAS) throw err;
      console.warn(`[PNCP] Falha de rede (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${url}`, err);
    }
    await esperar(BACKOFF_BASE_MS * 2 ** (tentativa - 1));
  }
  throw ultimoErro ?? new Error("[PNCP] Tentativas esgotadas.");
}

interface PNCPSearchItem {
  numero_controle_pncp: string;
  orgao_nome: string;
  orgao_cnpj: string;
  ano: string;
  numero_sequencial: string;
}

interface PNCPItemResponse {
  numeroItem: number;
  descricao: string;
  valorUnitarioEstimado: number;
  quantidade: number;
  unidadeMedida: string;
  dataAtualizacao: string;
  /** Indica que existe resultado de julgamento para o item — evita a chamada extra. */
  temResultado?: boolean;
}

/**
 * Resultado do julgamento de um item: é aqui que mora o preço efetivamente
 * contratado. O payload de `/itens` só traz `valorUnitarioEstimado`, que é o
 * orçamento **anterior** ao certame — usá-lo como referência de preço inflava a
 * série. Exemplo real (compra 83021857000115/2024/207, item 1): estimado
 * R$ 146,98 contra homologado R$ 50,00, uma diferença de 66%.
 */
interface PNCPResultadoItem {
  numeroItem: number;
  valorUnitarioHomologado: number | null;
  quantidadeHomologada: number | null;
  dataResultado: string | null;
  dataCancelamento: string | null;
  ordemClassificacaoSrp: number | null;
  sequencialResultado: number;
  nomeRazaoSocialFornecedor: string | null;
}

/**
 * A descrição do PNCP vem com HTML e entidades numéricas embutidos
 * (`"CERTIFICADO A1\r\n<p>validade &#8211; 12 meses</p>"`). Sem limpar, o lixo entra
 * na tokenização do filtro de relevância e é exibido cru na evidência.
 */
function limparDescricao(bruta: string): string {
  return bruta
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, codigo: string) => String.fromCodePoint(Number(codigo)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Busca textual real do PNCP (mesmo endpoint usado pelo site oficial em
 * pncp.gov.br/busca). A API de Consulta (/api/consulta) não suporta texto
 * livre — esse endpoint é o que permite encontrar processos relevantes ao
 * termo do item, em vez de uma amostra aleatória de publicações recentes.
 */
async function buscarPorTexto(termo: string): Promise<PNCPSearchItem[]> {
  const params = new URLSearchParams({
    q: termo,
    tipos_documento: "edital",
    // Relevância, não data: a recência já é garantida depois pelo filtroRecencia
    // (corte de 365 dias); ordenar por data aqui só traz os editais mais recentes
    // que casam vagamente com o termo, sacrificando os realmente relevantes.
    ordenacao: "relevancia",
    pagina: "1",
    tam_pagina: String(TAMANHO_PAGINA),
  });

  const url = `${PNCP_SEARCH_BASE_URL}/?${params.toString()}`;
  const res = await fetchComRetry(url);
  if (!res.ok) {
    console.error(`[PNCP] Falha na busca textual ("${termo}"): HTTP ${res.status}`);
    return [];
  }

  const body = (await res.json()) as { items?: PNCPSearchItem[] };
  const itens = body.items ?? [];

  // Exclusão do próprio órgão aplicada aqui (e não no chamador) para que qualquer
  // consumidor futuro da busca textual herde a regra automaticamente.
  const proprio = cnpjOrgaoProprio();
  return itens.filter((item) => normalizarCnpj(item.orgao_cnpj) !== proprio);
}

/** Percorre todas as páginas de `/itens`. Ver ITENS_TAMANHO_PAGINA. */
async function buscarTodosItens(processo: PNCPSearchItem): Promise<PNCPItemResponse[]> {
  const base = `${PNCP_ITENS_BASE_URL}/orgaos/${processo.orgao_cnpj}/compras/${processo.ano}/${processo.numero_sequencial}/itens`;
  const todos: PNCPItemResponse[] = [];

  for (let pagina = 1; pagina <= ITENS_MAX_PAGINAS; pagina++) {
    const res = await fetchComRetry(`${base}?pagina=${pagina}&tamanhoPagina=${ITENS_TAMANHO_PAGINA}`);
    if (!res.ok) {
      console.error(
        `[PNCP] Falha ao buscar itens de ${processo.numero_controle_pncp} (página ${pagina}): HTTP ${res.status}`,
      );
      break;
    }

    const lote = (await res.json()) as PNCPItemResponse[];
    if (!Array.isArray(lote) || lote.length === 0) break;

    todos.push(...lote);
    // Página incompleta significa fim da coleção — evita uma requisição extra.
    if (lote.length < ITENS_TAMANHO_PAGINA) break;
  }

  return todos;
}

/**
 * Mantém só os itens com palavra em comum com o termo pesquisado. Uma compra pode
 * ter centenas de itens e cada um custa uma requisição a mais para obter o valor
 * homologado; sem esse corte, buscar "certificado digital" consultaria os 418 itens
 * de uma ata de medicamentos. Termo sem token utilizável não filtra nada — errar
 * para o lado de consultar demais é preferível a devolver zero candidatos.
 */
function filtrarPorRelevancia(termo: string, itens: PNCPItemResponse[]): PNCPItemResponse[] {
  const tokensTermo = new Set(tokenizar(termo).map(raizPlural));
  if (tokensTermo.size === 0) return itens;

  return itens.filter((item) =>
    tokenizar(limparDescricao(item.descricao))
      .map(raizPlural)
      .some((token) => tokensTermo.has(token)),
  );
}

/**
 * Escolhe o resultado que representa o preço contratado: descarta cancelados e sem
 * valor, e fica com o primeiro colocado (`ordemClassificacaoSrp`). Um item de SRP
 * pode ter vários fornecedores classificados — o que virou preço é o primeiro.
 */
function escolherResultado(resultados: PNCPResultadoItem[]): PNCPResultadoItem | null {
  const validos = resultados.filter(
    (r) =>
      !r.dataCancelamento &&
      typeof r.valorUnitarioHomologado === "number" &&
      r.valorUnitarioHomologado > 0,
  );
  if (validos.length === 0) return null;

  const ordem = (r: PNCPResultadoItem) => r.ordemClassificacaoSrp ?? Number.MAX_SAFE_INTEGER;
  return [...validos].sort(
    (a, b) => ordem(a) - ordem(b) || a.sequencialResultado - b.sequencialResultado,
  )[0]!;
}

async function buscarResultadoDoItem(
  processo: PNCPSearchItem,
  numeroItem: number,
): Promise<PNCPResultadoItem | null> {
  const url = `${PNCP_ITENS_BASE_URL}/orgaos/${processo.orgao_cnpj}/compras/${processo.ano}/${processo.numero_sequencial}/itens/${numeroItem}/resultados`;

  const res = await fetchComRetry(url);
  if (!res.ok) {
    // 404 é esperado em item sem julgamento — não é erro operacional.
    if (res.status !== 404) {
      console.warn(
        `[PNCP] Falha ao buscar resultado do item ${numeroItem} de ${processo.numero_controle_pncp}: HTTP ${res.status}`,
      );
    }
    return null;
  }

  const corpo = (await res.json()) as PNCPResultadoItem[];
  return Array.isArray(corpo) ? escolherResultado(corpo) : null;
}

async function buscarItensDaCompra(
  processo: PNCPSearchItem,
  termo: string,
): Promise<CandidatoSimilaridade[]> {
  try {
    const todos = await buscarTodosItens(processo);

    // `temResultado === false` dispensa a chamada extra; ausente (contrato antigo da
    // API) é tratado como "pode ter" para não descartar item válido por omissão.
    const candidatos = filtrarPorRelevancia(termo, todos)
      .filter((item) => item.temResultado !== false)
      .slice(0, MAX_ITENS_RELEVANTES_POR_COMPRA);

    const resultados = await processarComConcorrencia(
      candidatos,
      LOTE_BUSCA_RESULTADOS,
      (item) => buscarResultadoDoItem(processo, item.numeroItem),
      (item, erro) =>
        console.warn(
          `[PNCP] Erro no resultado do item ${item.numeroItem} de ${processo.numero_controle_pncp}:`,
          erro,
        ),
    );

    const encontrados: CandidatoSimilaridade[] = [];
    candidatos.forEach((item, indice) => {
      const resultado = resultados[indice];
      // Item sem valor homologado fica de fora: só entra na série o preço
      // efetivamente contratado. Decisão do usuário em 2026-07-30 — o estimado é
      // anterior ao certame e distorce a estimativa (IN 65/2021).
      if (!resultado?.valorUnitarioHomologado) return;

      encontrados.push({
        tipoCandidato: "contratacao_publica",
        fonteDescricao: limparDescricao(item.descricao),
        fonteOrgaoOuId: processo.orgao_nome,
        fonteUrl: montarUrlEdital(processo),
        valorUnitario: resultado.valorUnitarioHomologado,
        // `dataResultado` é a data do julgamento — referência correta do preço.
        // `dataAtualizacao` do item muda por edição cadastral e não representa nada.
        dataReferencia: new Date(resultado.dataResultado ?? item.dataAtualizacao),
        unidade: item.unidadeMedida,
        quantidade: resultado.quantidadeHomologada ?? item.quantidade,
        // Identidade estruturada da compra: alimenta a deduplicação entre
        // provedores do registry (docs/ApiPlan.md §3.4) quando a mesma
        // contratação chegar também por outra fonte.
        identidadeContratacao: {
          cnpjOrgao: processo.orgao_cnpj,
          ano: processo.ano,
          numeroSequencial: processo.numero_sequencial,
          numeroItem: item.numeroItem,
        },
      });
    });

    return encontrados;
  } catch (err) {
    console.error(`[PNCP] Erro ao buscar itens de ${processo.numero_controle_pncp}:`, err);
    return [];
  }
}

export interface FiltroValorPNCP {
  valorMinimo?: number;
  valorMaximo?: number;
}

/**
 * Aplica a faixa de valor sobre os candidatos já buscados. O PNCP não tem
 * parâmetro de faixa de valor em nenhum dos endpoints usados aqui (busca
 * textual e itens/resultados de uma compra) — o filtro só existe no lado da
 * aplicação, depois que o preço homologado já foi resolvido. Como
 * `buscarItensDaCompra` já descarta todo item sem homologado, `valorUnitario`
 * aqui é sempre o preço efetivamente contratado, nunca o estimado.
 */
function filtrarPorValor(
  candidatos: CandidatoSimilaridade[],
  filtro?: FiltroValorPNCP,
): CandidatoSimilaridade[] {
  if (!filtro || (filtro.valorMinimo === undefined && filtro.valorMaximo === undefined)) {
    return candidatos;
  }
  return candidatos.filter(
    (c) =>
      (filtro.valorMinimo === undefined || c.valorUnitario >= filtro.valorMinimo) &&
      (filtro.valorMaximo === undefined || c.valorUnitario <= filtro.valorMaximo),
  );
}

/**
 * Busca contratações públicas relevantes ao termo informado, usando a busca
 * textual do PNCP para encontrar processos prováveis e depois lendo os itens
 * de cada um. Deve ser chamada por item (descrição/palavras-chave), não uma
 * única vez por processo — o termo é o que torna os candidatos relevantes.
 *
 * Devolve **apenas preços homologados**: o valor estimado do edital é o orçamento
 * feito antes do certame e não serve como referência de preço praticado.
 */
export async function buscarContratosPNCP(
  termo: string,
  filtroValor?: FiltroValorPNCP,
): Promise<CandidatoSimilaridade[]> {
  if (!termo.trim()) return [];

  try {
    const inicio = Date.now();
    const processos = await buscarPorTexto(termo);
    const itensPorProcesso: CandidatoSimilaridade[][] = [];
    for (let i = 0; i < processos.length; i += LOTE_BUSCA_ITENS) {
      if (Date.now() - inicio >= TEMPO_MAX_BUSCA_MS) {
        console.warn(
          `[PNCP] Teto de tempo atingido em "${termo}": ${i} de ${processos.length} editais lidos.`,
        );
        break;
      }
      const lote = processos.slice(i, i + LOTE_BUSCA_ITENS);
      itensPorProcesso.push(
        ...(await Promise.all(lote.map((processo) => buscarItensDaCompra(processo, termo)))),
      );
    }
    return filtrarPorValor(itensPorProcesso.flat(), filtroValor);
  } catch (err) {
    console.error(`[PNCP] Erro inesperado ao buscar contratações para "${termo}":`, err);
    return [];
  }
}
