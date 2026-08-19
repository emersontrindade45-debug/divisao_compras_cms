import "server-only";
import type { CandidatoSimilaridade } from "@/lib/ia/types";
import { tokenizar, raizPlural, normalizar } from "@/lib/similaridade/texto";
import { montarUrlEditalPncp } from "@/lib/similaridade/linkOrigem";
import { db } from "@/lib/db";

/**
 * Integração com a API de Dados Abertos do Compras.gov.br
 * (dadosabertos.compras.gov.br — módulos de pesquisa de preços e serviços).
 *
 * Estratégia de busca:
 * 1. Carrega o catálogo CATSER — hoje de `ItemCatalogoReferencia` (ingerido
 *    por `src/lib/ingestao/catalogoComprasGov.ts`, docs/ApiPlan.md §M16),
 *    com fallback para o download direto por request se a tabela ainda
 *    estiver vazia (ver `carregarCatalogoServicos` abaixo) — e o guarda em
 *    cache de módulo para evitar recarregar em toda busca.
 * 2. Usa sobreposição de tokens para encontrar os serviços mais similares ao
 *    termo pesquisado.
 * 3. Consulta `modulo-pesquisa-preco/3_consultarServico` para cada código
 *    encontrado e devolve **somente** preços homologados como
 *    `CandidatoSimilaridade`. O parâmetro OpenAPI `dataResultado=true` é
 *    enviado, mas a garantia é no cliente: sem `dataResultado` plausível a
 *    linha não entra (não há fallback para `dataCompra`). Se a compra existir
 *    no PNCP, exige `existeResultado` e `valorTotalHomologado > 0`.
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

// Teto ANTES de resolver URL por idCompra. Cada id custa um GET ao PNCP
// (~0,7s; conc. 3). Sem este corte, 4 códigos CATSER × dezenas de compras
// estouram os 12s do assistente e o provedor inteiro é descartado — o
// analista só vê PNCP. 10 cabe no orçamento e no round-robin da tela.
const MAX_CANDIDATOS_PAINEL = 10;

// Mesma janela do PNCP (CLAUDE.md §9.65): a API devolve data-sentinela no lugar
// de nulo. Preço sem data verdadeira de julgamento não entra na estimativa.
const DATA_REFERENCIA_MINIMA = new Date("2000-01-01T00:00:00Z");
const DATA_REFERENCIA_MAXIMA = new Date("2100-01-01T00:00:00Z");

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
  /** Identificador da compra no Compras.gov.br — presente na API real (OpenAPI + amostra 2026-08-19). */
  idCompra?: string;
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
 * Carrega o catálogo CATSER de `ItemCatalogoReferencia` (ingerido por
 * `src/lib/ingestao/catalogoComprasGov.ts` — `null` se a tabela ainda não
 * tem nenhuma linha com `fonteChave: "catser"`, o que sinaliza ao chamador
 * para cair no download por request.
 *
 * Perda de recall conhecida e aceita: `ItemCatalogoReferencia` guarda só
 * `descricao` (mapeada de `nomeServico`) e `codigoClasse` numérico — não os
 * nomes textuais de grupo/classe/subclasse que o catálogo por request expõe
 * (`nomeGrupo`/`nomeClasse`/`nomeSubclasse`). `scoreServico` já tolera campos
 * ausentes (`.filter(Boolean)`), então o matching cai para pontuar só pela
 * descrição do serviço — nenhuma quebra, cobertura um pouco mais estreita
 * para termos que só aparecem no nome da categoria, não no nome do serviço.
 * Fechar essa lacuna (armazenar os nomes textuais) é trabalho do matching
 * léxico local, fora do escopo desta migração de fonte de dados.
 */
async function carregarCatalogoServicosDoBanco(): Promise<ServicosCatalogo[] | null> {
  const itens = await db.itemCatalogoReferencia.findMany({
    where: { fonteChave: "catser", ativo: true },
    select: { codigo: true, descricao: true },
  });
  if (itens.length === 0) return null;

  return itens.map((item) => ({
    codigoServico: item.codigo,
    nomeServico: item.descricao,
  }));
}

/**
 * Baixa o catálogo CATSER inteiro por request, paginando em paralelo.
 * Fallback usado enquanto `ItemCatalogoReferencia` ainda não foi populada
 * para "catser" (ingestão real ainda não rodou — ver
 * `scripts/ingerir-catalogo-compras-gov.ts`).
 */
async function baixarCatalogoServicosPorRequest(): Promise<ServicosCatalogo[]> {
  // Busca a primeira página para descobrir o total de páginas.
  const primeira = await fetchJSON<RespostaPaginada<ServicosCatalogo>>(
    `${BASE_URL}/modulo-servico/6_consultarItemServico?tamanhoPagina=${CATALOGO_POR_PAGINA}&statusServico=true&pagina=1`,
  );
  if (!primeira?.resultado?.length) return [];

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
  return todos;
}

/**
 * Carrega o catálogo CATSER e mantém em cache de módulo.
 *
 * Fonte primária: `ItemCatalogoReferencia` (tabela local, ingerida por
 * `src/lib/ingestao/catalogoComprasGov.ts`) — elimina o download de ~3 100
 * itens a cada cold start. Se a tabela ainda estiver vazia (ingestão real
 * ainda não rodou em produção — CLAUDE.md §8 exige autorização explícita
 * para isso), cai no download por request de antes, com um aviso de log:
 * silenciosamente trocar de fonte sem esse fallback quebraria o matching
 * assim que este código fosse publicado antes da ingestão rodar.
 *
 * No ambiente serverless, o cache sobrevive entre invocações da mesma
 * instância (instâncias quentes), mas é descartado no cold start.
 */
async function carregarCatalogoServicos(): Promise<ServicosCatalogo[]> {
  if (catalogoCache) return catalogoCache;
  if (carregandoCache) return carregandoCache;

  carregandoCache = (async () => {
    const doBanco = await carregarCatalogoServicosDoBanco();
    if (doBanco) {
      catalogoCache = doBanco;
      return doBanco;
    }

    console.warn(
      '[ComprasGov] ItemCatalogoReferencia vazia para "catser" — usando fallback por request ' +
        "(download direto da API). Rode a ingestão " +
        "(scripts/ingerir-catalogo-compras-gov.ts catser) para eliminar este download a cada " +
        "cold start.",
    );

    const todos = await baixarCatalogoServicosPorRequest();
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

function encontrarServicos(termo: string, catalogo: ServicosCatalogo[]): ServicosCatalogo[] {
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

function dataResultadoPlausivel(bruta: string | null | undefined): Date | null {
  if (!bruta?.trim()) return null;
  const data = new Date(bruta);
  if (Number.isNaN(data.getTime())) return null;
  if (data < DATA_REFERENCIA_MINIMA || data >= DATA_REFERENCIA_MAXIMA) return null;
  return data;
}

/** Compra já julgada/homologada no Painel: tem data de resultado e preço > 0. */
function precoHomologadoNoPainel(preco: PrecoPesquisaServico): boolean {
  if (typeof preco.precoUnitario !== "number" || preco.precoUnitario <= 0) return false;
  return dataResultadoPlausivel(preco.dataResultado) !== null;
}

async function buscarPrecosServico(
  codigoItemCatalogo: number,
  janela?: { dataInicio: string; dataFim: string },
): Promise<PrecoPesquisaServico[]> {
  const { dataInicio, dataFim } = janela ?? dataRange();
  const params = new URLSearchParams({
    pagina: "1",
    codigoItemCatalogo: String(codigoItemCatalogo),
    tamanhoPagina: String(PRECOS_POR_PAGINA),
    dataCompraInicio: dataInicio,
    dataCompraFim: dataFim,
    // OpenAPI: boolean, default false, descrição vazia. Medido em 2026-08-19
    // (CATSER 23329): true e false devolveram o mesmo total — o filtro real é
    // `precoHomologadoNoPainel` abaixo. Enviar true documenta a intenção.
    dataResultado: "true",
  });
  const url = `${BASE_URL}/modulo-pesquisa-preco/3_consultarServico?${params}`;

  const data = await fetchJSON<RespostaPaginada<PrecoPesquisaServico>>(url);
  return (data?.resultado ?? []).filter(precoHomologadoNoPainel);
}

function chaveNome(texto: string): string {
  return normalizar(texto).replace(/\s+/g, " ").trim();
}

function acharCodigosPorDescricao(catalogo: ServicosCatalogo[], descricao: string): number[] {
  const alvo = chaveNome(descricao);
  const exatos = [
    ...new Set(
      catalogo.filter((s) => chaveNome(s.nomeServico) === alvo).map((s) => s.codigoServico),
    ),
  ];
  if (exatos.length > 0) return exatos;
  return encontrarServicos(descricao, catalogo).map((s) => s.codigoServico);
}

function escolherIdCompra(
  precos: PrecoPesquisaServico[],
  candidato: CandidatoPainelParaUrl,
): string | null {
  const orgao = chaveNome(candidato.fonteOrgaoOuId);
  const alvoMs = Date.parse(candidato.dataReferencia);
  const casados = precos.filter((p) => {
    if (!p.idCompra?.trim()) return false;
    if (Math.abs(p.precoUnitario - candidato.valorUnitario) > 0.02) return false;
    return chaveNome(p.nomeOrgao) === orgao || chaveNome(p.nomeUasg) === orgao;
  });
  if (casados.length === 0) return null;
  if (casados.length === 1 || Number.isNaN(alvoMs)) return casados[0]!.idCompra!.trim();
  casados.sort((a, b) => {
    const da = Date.parse(a.dataResultado ?? "");
    const db = Date.parse(b.dataResultado ?? "");
    return Math.abs(da - alvoMs) - Math.abs(db - alvoMs);
  });
  return casados[0]!.idCompra!.trim();
}

async function emParalelo<T, R>(
  itens: T[],
  limite: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const saida: R[] = new Array(itens.length);
  let proximo = 0;
  async function worker() {
    while (proximo < itens.length) {
      const i = proximo++;
      saida[i] = await fn(itens[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, () => worker()));
  return saida;
}

const FASE_EXTERNA_LINK =
  "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-fase-externa/v1/compras";
const TIMEOUT_URL_PUBLICA_MS = 8_000;

interface OrigemPublicaHomologada {
  /** false = a compra está no PNCP sem homologação — não entra na lista. */
  incluir: boolean;
  url: string | null;
}

const cacheOrigemPublica = new Map<string, Promise<OrigemPublicaHomologada>>();

interface ContratacaoPncpPorId {
  orgaoEntidadeCnpj?: string | null;
  anoCompraPncp?: number | string | null;
  sequencialCompraPncp?: number | string | null;
  existeResultado?: boolean | null;
  valorTotalHomologado?: number | null;
  contratacaoExcluida?: boolean | null;
}

type StatusPncpPorId =
  | { kind: "ausente" }
  | { kind: "nao_homologada" }
  | { kind: "homologada"; url: string | null };

function statusHomologacaoPncp(item: ContratacaoPncpPorId): StatusPncpPorId {
  if (item.contratacaoExcluida === true) return { kind: "nao_homologada" };
  if (item.existeResultado !== true) return { kind: "nao_homologada" };
  const valor = Number(item.valorTotalHomologado);
  if (!Number.isFinite(valor) || valor <= 0) return { kind: "nao_homologada" };

  const cnpj = item.orgaoEntidadeCnpj?.trim();
  const ano = item.anoCompraPncp != null ? String(item.anoCompraPncp).trim() : "";
  const sequencial =
    item.sequencialCompraPncp != null ? String(item.sequencialCompraPncp).trim() : "";
  const url =
    cnpj && ano && sequencial
      ? montarUrlEditalPncp({ cnpjOrgao: cnpj, ano, numeroSequencial: sequencial })
      : null;
  return { kind: "homologada", url };
}

async function consultarStatusPncpPorIdCompra(idCompra: string): Promise<StatusPncpPorId> {
  const url =
    `${BASE_URL}/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id` +
    `?tipo=idCompra&codigo=${encodeURIComponent(idCompra)}`;
  const data = await fetchJSON<RespostaPaginada<ContratacaoPncpPorId>>(url);
  const item = data?.resultado?.[0];
  if (!item) return { kind: "ausente" };
  return statusHomologacaoPncp(item);
}

async function consultarLinkFaseExterna(idCompra: string): Promise<string | null> {
  const url = `${FASE_EXTERNA_LINK}/${encodeURIComponent(idCompra)}/link`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(TIMEOUT_URL_PUBLICA_MS),
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (!text.startsWith("https://")) return null;
    if (text.includes("compra-nao-encontrada")) return null;
    return text;
  } catch {
    return null;
  }
}

async function resolverOrigemHomologada(idCompra: string): Promise<OrigemPublicaHomologada> {
  const id = idCompra.trim();
  if (!id) return { incluir: true, url: null };
  const cached = cacheOrigemPublica.get(id);
  if (cached) return cached;
  const pendente = (async (): Promise<OrigemPublicaHomologada> => {
    const status = await consultarStatusPncpPorIdCompra(id);
    if (status.kind === "nao_homologada") return { incluir: false, url: null };
    if (status.kind === "homologada" && status.url) {
      return { incluir: true, url: status.url };
    }
    return { incluir: true, url: await consultarLinkFaseExterna(id) };
  })();
  cacheOrigemPublica.set(id, pendente);
  return pendente;
}

/**
 * URL pública conferível da compra homologada: edital do PNCP quando a
 * contratação está lá **e** tem resultado (`existeResultado` + valor
 * homologado > 0). Compra no PNCP sem homologação não recebe href. Sem
 * registro no PNCP, usa o `/link` da fase externa se ele confirmar que a
 * página existe.
 */
export async function resolverUrlPublicaPorIdCompra(idCompra: string): Promise<string | null> {
  const origem = await resolverOrigemHomologada(idCompra);
  return origem.incluir ? origem.url : null;
}

export interface CandidatoPainelParaUrl {
  fonteDescricao: string;
  fonteOrgaoOuId: string;
  valorUnitario: number;
  dataReferencia: string;
}

/**
 * Reconstrói a URL do acompanhamento da compra para candidatos do Painel
 * gravados sem `fonteUrl` (conversas antigas) ou com a home do Lite.
 *
 * Casa órgão + valor contra `3_consultarServico` no código CATSER da
 * descrição — não devolve a home do portal. Sem casa, devolve `null`.
 */
export async function resolverUrlsAcompanhamentoPainel(
  candidatos: CandidatoPainelParaUrl[],
): Promise<(string | null)[]> {
  if (candidatos.length === 0) return [];

  const catalogo = await carregarCatalogoServicos();
  if (catalogo.length === 0) return candidatos.map(() => null);

  const descToCodigos = new Map<string, number[]>();
  for (const c of candidatos) {
    const chave = chaveNome(c.fonteDescricao);
    if (descToCodigos.has(chave)) continue;
    descToCodigos.set(chave, acharCodigosPorDescricao(catalogo, c.fonteDescricao));
  }

  const codigoToDatas = new Map<number, number[]>();
  for (const c of candidatos) {
    const ms = Date.parse(c.dataReferencia);
    for (const codigo of descToCodigos.get(chaveNome(c.fonteDescricao)) ?? []) {
      const lista = codigoToDatas.get(codigo) ?? [];
      if (!Number.isNaN(ms)) lista.push(ms);
      codigoToDatas.set(codigo, lista);
    }
  }

  const codigos = [...codigoToDatas.keys()];
  const precosPorCodigo = new Map<number, PrecoPesquisaServico[]>();
  const lotes = await emParalelo(codigos, 3, async (codigo) => {
    const timestamps = codigoToDatas.get(codigo) ?? [];
    const janela =
      timestamps.length === 0
        ? dataRange()
        : {
            dataInicio: new Date(Math.min(...timestamps) - 4 * 86_400_000)
              .toISOString()
              .slice(0, 10),
            dataFim: new Date(Math.max(...timestamps) + 4 * 86_400_000).toISOString().slice(0, 10),
          };
    return { codigo, precos: await buscarPrecosServico(codigo, janela) };
  });
  for (const { codigo, precos } of lotes) {
    precosPorCodigo.set(codigo, precos);
  }

  return Promise.all(
    candidatos.map((c) => {
      const precos: PrecoPesquisaServico[] = [];
      for (const codigo of descToCodigos.get(chaveNome(c.fonteDescricao)) ?? []) {
        precos.push(...(precosPorCodigo.get(codigo) ?? []));
      }
      const idCompra = escolherIdCompra(precos, c);
      return idCompra ? resolverUrlPublicaPorIdCompra(idCompra) : Promise.resolve(null);
    }),
  );
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
export async function buscarContratosComprasGov(termo: string): Promise<CandidatoSimilaridade[]> {
  if (!termo.trim()) return [];

  try {
    const catalogo = await carregarCatalogoServicos();
    const servicosMatch = encontrarServicos(termo, catalogo);

    if (servicosMatch.length === 0) return [];

    const precosPorServico = await Promise.all(
      servicosMatch.map((s) => buscarPrecosServico(s.codigoServico)),
    );

    const candidatos: CandidatoSimilaridade[] = [];
    const idsCompra: (string | null)[] = [];
    const vistos = new Set<string>();

    for (const precos of precosPorServico) {
      for (const preco of precos) {
        const dataRef = dataResultadoPlausivel(preco.dataResultado);
        if (!dataRef) continue;

        // Deduplicação simples: mesma descrição + mesmo preço = mesmo resultado.
        const chave = `${preco.descricaoItem.slice(0, 80)}|${preco.precoUnitario}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);

        const idCompra = preco.idCompra?.trim() || null;
        idsCompra.push(idCompra);
        candidatos.push({
          tipoCandidato: "painel_precos",
          fonteDescricao: preco.descricaoItem,
          fonteOrgaoOuId: preco.nomeOrgao || preco.nomeUasg,
          valorUnitario: preco.precoUnitario,
          dataReferencia: dataRef,
          unidade: preco.siglaUnidadeMedida || preco.nomeUnidadeMedida || "UN",
          quantidade: preco.quantidade || 1,
        });
      }
    }

    const idsCortados = idsCompra.slice(0, MAX_CANDIDATOS_PAINEL);
    const candidatosCortados = candidatos.slice(0, MAX_CANDIDATOS_PAINEL);

    const origens = await emParalelo(idsCortados, 3, (id) =>
      id ? resolverOrigemHomologada(id) : Promise.resolve({ incluir: true, url: null }),
    );
    const homologados: CandidatoSimilaridade[] = [];
    for (let i = 0; i < candidatosCortados.length; i++) {
      const origem = origens[i]!;
      if (!origem.incluir) continue;
      if (origem.url) candidatosCortados[i]!.fonteUrl = origem.url;
      homologados.push(candidatosCortados[i]!);
    }

    return homologados;
  } catch (err) {
    console.error(`[ComprasGov] Erro ao buscar para "${termo}":`, err);
    return [];
  }
}
