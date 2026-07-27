import "server-only";
import { z } from "zod";

// Busca na web aberta via Perplexity Sonar (M13).
//
// Por que `fetch` puro e não o SDK `openai` (que é OpenAI-compatible e já está
// instalado): os parâmetros que carregam a conformidade aqui —
// `search_domain_filter` e `search_recency_filter` — não existem nos tipos do
// SDK da OpenAI, e passá-los exigiria um cast que a convenção do projeto proíbe
// (TypeScript estrito, sem `any`). Com `fetch` + Zod o contrato fica explícito e
// validado, no mesmo estilo de `pncp.ts`.

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

/** Modelo de busca. `sonar-pro` tem contexto maior e melhor síntese com citações. */
const MODELO_PADRAO = "sonar-pro";

const MAX_TENTATIVAS = 3;
const BACKOFF_BASE_MS = 1000;

/**
 * Limite da API: `search_domain_filter` aceita no máximo 20 entradas, somando
 * allowlist e denylist. Estourar faz a requisição inteira falhar, então o corte
 * acontece aqui, de forma previsível, em vez de virar erro 400 em produção.
 */
export const MAX_DOMINIOS_FILTRO = 20;

/** Janela da IN 65/2021: contratação similar vale por 365 dias. */
const RECENCIA_PADRAO = "year";

export interface ResultadoWeb {
  titulo: string;
  url: string;
  trecho?: string;
  /** Data informada pela própria fonte, quando existir e for parseável. */
  dataPublicacao?: Date;
}

export interface RespostaBuscaWeb {
  /** Síntese textual produzida pelo modelo, com as citações embutidas. */
  resumo: string;
  resultados: ResultadoWeb[];
  /**
   * Instante em que a busca foi executada.
   *
   * ATENÇÃO: isto NÃO é a "data e hora de acesso" que a IN 65/2021 exige para
   * evidência de sítio eletrônico. Aquela é o acesso real do servidor à página,
   * registrado com o arquivo capturado pelo módulo de Sites (`CapturaEvidencia`).
   * Usar este campo como metadado de evidência seria fabricar a prova.
   */
  buscadoEm: Date;
  modelo: string;
}

export interface OpcoesBuscaWeb {
  /** Domínios permitidos (lista branca). Cortada em MAX_DOMINIOS_FILTRO. */
  dominiosPermitidos?: string[];
  /** Domínios bloqueados (lista vermelha/marketplaces). Enviados com prefixo "-". */
  dominiosBloqueados?: string[];
  /** "hour" | "day" | "week" | "month" | "year". Padrão: "year". */
  recencia?: string;
  modelo?: string;
}

/**
 * Erro de configuração ausente. Tipado para o registry de ferramentas conseguir
 * distinguir "não configurado" (esconde a ferramenta) de "falhou" (reporta).
 */
export class PerplexityNaoConfiguradaError extends Error {
  constructor() {
    super(
      "PERPLEXITY_API_KEY não está definida. A busca na web via Perplexity fica " +
        "indisponível; o assistente segue funcionando com PNCP e a busca web da OpenAI.",
    );
    this.name = "PerplexityNaoConfiguradaError";
  }
}

/** Permite ao registry decidir se expõe a ferramenta, sem provocar exceção. */
export function perplexityConfigurada(): boolean {
  return Boolean(process.env.PERPLEXITY_API_KEY?.trim());
}

// Schemas deliberadamente tolerantes: a API evolui e campos novos/ausentes não
// podem derrubar uma busca. Só `choices[].message.content` é tratado como
// essencial — sem ele não há resposta a devolver.
const searchResultSchema = z.object({
  title: z.string().optional(),
  url: z.string().optional(),
  snippet: z.string().optional(),
  date: z.string().nullish(),
  last_updated: z.string().nullish(),
});

const respostaSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullish() }).optional(),
      }),
    )
    .optional(),
  citations: z.array(z.string()).optional(),
  search_results: z.array(searchResultSchema).optional(),
});

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Converte a data textual da fonte; devolve undefined em vez de Invalid Date. */
function parseData(valor: string | null | undefined): Date | undefined {
  if (!valor) return undefined;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? undefined : data;
}

/**
 * Monta o `search_domain_filter`: allowlist sem prefixo, denylist com "-".
 *
 * A allowlist tem prioridade no corte, porque restringir a domínios confiáveis
 * é mais forte que excluir alguns ruins — se só couberem 20 entradas, é melhor
 * gastá-las dizendo "só estes" do que "estes não". A filtragem por lista
 * vermelha é reaplicada em código sobre os resultados (ver guardas do
 * assistente), então nenhum marketplace passa mesmo que seu domínio não caiba
 * aqui.
 */
export function montarFiltroDominios(
  permitidos: string[] = [],
  bloqueados: string[] = [],
): string[] {
  const limpos = (lista: string[]) =>
    Array.from(new Set(lista.map((d) => d.trim().toLowerCase()).filter(Boolean)));

  const allow = limpos(permitidos).slice(0, MAX_DOMINIOS_FILTRO);
  const restante = MAX_DOMINIOS_FILTRO - allow.length;
  const deny = restante > 0 ? limpos(bloqueados).slice(0, restante).map((d) => `-${d}`) : [];

  return [...allow, ...deny];
}

async function postComRetry(corpo: unknown, chave: string): Promise<Response> {
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const res = await fetch(PERPLEXITY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${chave}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(corpo),
      });
      const retryavel = res.status === 429 || res.status >= 500;
      if (res.ok || !retryavel || tentativa === MAX_TENTATIVAS) return res;
      console.warn(`[Perplexity] HTTP ${res.status} (tentativa ${tentativa}/${MAX_TENTATIVAS})`);
    } catch (err) {
      ultimoErro = err;
      if (tentativa === MAX_TENTATIVAS) throw err;
      console.warn(`[Perplexity] Falha de rede (tentativa ${tentativa}/${MAX_TENTATIVAS})`, err);
    }
    await esperar(BACKOFF_BASE_MS * 2 ** (tentativa - 1));
  }
  throw ultimoErro ?? new Error("[Perplexity] Tentativas esgotadas.");
}

/**
 * Executa uma busca na web aberta com resposta sintetizada e citações.
 *
 * Diferente do PNCP, aqui não há preço estruturado: o retorno é material de
 * pesquisa (páginas, atas, editais em portais de outros órgãos) que o assistente
 * lê para propor candidatos. Nada disso vira Fonte ou Evidencia automaticamente.
 */
export async function buscarWebPerplexity(
  consulta: string,
  opcoes: OpcoesBuscaWeb = {},
): Promise<RespostaBuscaWeb> {
  const chave = process.env.PERPLEXITY_API_KEY?.trim();
  if (!chave) throw new PerplexityNaoConfiguradaError();

  const modelo = opcoes.modelo ?? MODELO_PADRAO;
  const filtroDominios = montarFiltroDominios(
    opcoes.dominiosPermitidos,
    opcoes.dominiosBloqueados,
  );

  const corpo: Record<string, unknown> = {
    model: modelo,
    messages: [{ role: "user", content: consulta }],
    search_recency_filter: opcoes.recencia ?? RECENCIA_PADRAO,
  };
  // Enviar array vazio restringiria a busca a nada; o campo só vai quando há filtro.
  if (filtroDominios.length > 0) corpo.search_domain_filter = filtroDominios;

  const buscadoEm = new Date();
  const res = await postComRetry(corpo, chave);

  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    throw new Error(
      `[Perplexity] Busca falhou com HTTP ${res.status}. ${detalhe.slice(0, 300)}`,
    );
  }

  const bruto: unknown = await res.json();
  const parsed = respostaSchema.safeParse(bruto);
  if (!parsed.success) {
    // CLAUDE.md §9.12: resposta de IA usada em decisão de negócio nunca é
    // consumida sem parsing defensivo.
    throw new Error(
      `[Perplexity] Resposta fora do formato esperado: ${parsed.error.message}`,
      { cause: parsed.error },
    );
  }

  const dados = parsed.data;
  const resumo = dados.choices?.[0]?.message?.content ?? "";

  // `search_results` é a fonte rica (título + trecho + data). Quando a API só
  // devolve `citations` (lista de URLs), degradamos para o mínimo utilizável em
  // vez de perder o resultado inteiro.
  const deSearchResults: ResultadoWeb[] = (dados.search_results ?? [])
    .filter((r): r is typeof r & { url: string } => Boolean(r.url))
    .map((r) => ({
      titulo: r.title?.trim() || r.url,
      url: r.url,
      trecho: r.snippet ?? undefined,
      dataPublicacao: parseData(r.date ?? r.last_updated),
    }));

  const urlsJaVistas = new Set(deSearchResults.map((r) => r.url));
  const deCitacoes: ResultadoWeb[] = (dados.citations ?? [])
    .filter((url) => url && !urlsJaVistas.has(url))
    .map((url) => ({ titulo: url, url }));

  return {
    resumo,
    resultados: [...deSearchResults, ...deCitacoes],
    buscadoEm,
    modelo: dados.model ?? modelo,
  };
}
