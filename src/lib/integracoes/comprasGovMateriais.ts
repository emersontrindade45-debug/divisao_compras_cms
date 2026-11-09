import "server-only";
import { z } from "zod";
import { statusHomologacaoPncp } from "./comprasGov";

/**
 * Cliente do Painel de Preços de MATERIAIS do Compras.gov.br
 * (`modulo-pesquisa-preco/1_consultarMaterial`).
 *
 * O provedor `painel_precos` (`comprasGov.ts`) só consulta SERVIÇOS
 * (`3_consultarServico`). Material — a maior parte do que a Câmara pesquisa
 * (MFP, scanner, tablet, toner) — ficava sem essa fonte. Medido em 2026-11-09:
 * a família "IMPRESSORA MULTIFUNCIONAL" (PDM 226), em SP e nos últimos 24
 * meses, devolve 242 preços homologados em 2,1s, 91 deles de dispensa.
 *
 * **Por que consultar pela família (PDM) e não pelo código do item.** O
 * endpoint aceita `tipo=codigoItemCatalogo` ou `tipo=codigoPdm`. O código
 * CATMAT exato é específico demais: os três códigos de multifuncional e de
 * caneta testados devolveram ZERO, porque cada órgão cataloga uma variante
 * diferente. O PDM agrega todas as variantes, e a seleção do que é comparável
 * fica para o ranqueamento local + corte por IA, que já existem.
 *
 * **`idCompra` chega como número JSON de 17 dígitos** — acima de
 * `Number.MAX_SAFE_INTEGER`. `JSON.parse` arredonda: medido, 367 de 500 linhas
 * saíam com outro id (`46272305900232025` → `…024`), e a checagem de
 * homologação no PNCP consultaria uma compra diferente. No endpoint de serviços
 * o mesmo campo vem como string, por isso o defeito nunca apareceu lá. A
 * correção é citar o número no texto bruto ANTES do parse (`citarIdsGrandes`).
 */

const BASE_URL = "https://dadosabertos.compras.gov.br";

/** Teto por requisição — sem ele o `fetch` do Node herda 300s do undici (CLAUDE.md §9.64). */
const TIMEOUT_REQUISICAO_MS = 6_000;
const MAX_TENTATIVAS = 2;
const BACKOFF_MS = 500;
const BACKOFF_LIMITE_MS = 1_500;

/** Máximo aceito pelo endpoint; a página 1 vem com as compras mais recentes primeiro (medido). */
const TAMANHO_PAGINA = 500;

const DATA_REFERENCIA_MINIMA = new Date("2000-01-01T00:00:00Z");
const DATA_REFERENCIA_MAXIMA = new Date("2100-01-01T00:00:00Z");

// ── Fronteira: validação da resposta ────────────────────────────────────────

/**
 * Número que pode chegar como número OU como texto. Medido em 2026-11-09: neste
 * endpoint `codigoPdm` vem como string (`"226"`), enquanto no catálogo e na ARP
 * o mesmo campo é número. Exigir `z.number()` aqui derrubava TODAS as linhas.
 */
const numeroFlexivel = z.union([z.number(), z.string()]).transform((v) => {
  const n = typeof v === "number" ? v : Number(v.trim());
  return Number.isFinite(n) ? n : null;
});

/**
 * Só os campos que provam o preço (id da compra, descrição, valor, data do
 * resultado, órgão) podem reprovar a linha. Os demais usam `.catch(null)`:
 * um tipo inesperado num campo de exibição não pode jogar fora um preço
 * homologado válido, que é o que aconteceu com `codigoPdm` acima.
 */
const opcional = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().catch(null);

const precoMaterialApiSchema = z.object({
  idCompra: z.string().nullish(),
  descricaoItem: z.string().nullish(),
  precoUnitario: numeroFlexivel.nullish(),
  dataResultado: z.string().nullish(),
  nomeOrgao: opcional(z.string()),
  nomeUasg: opcional(z.string()),
  numeroItemCompra: opcional(numeroFlexivel),
  codigoItemCatalogo: opcional(numeroFlexivel),
  codigoPdm: opcional(numeroFlexivel),
  siglaUnidadeFornecimento: opcional(z.string()),
  nomeUnidadeFornecimento: opcional(z.string()),
  quantidade: opcional(numeroFlexivel),
  marca: opcional(z.string()),
  nomeFornecedor: opcional(z.string()),
  estado: opcional(z.string()),
  municipio: opcional(z.string()),
  esfera: opcional(z.string()),
  modalidade: opcional(numeroFlexivel),
});

const respostaPaginadaSchema = z.object({
  resultado: z.array(z.unknown()).default([]),
  totalRegistros: z.number().nullish(),
});

const itemMaterialCatalogoSchema = z.object({
  codigoPdm: numeroFlexivel.nullish(),
  nomePdm: z.string().nullish().catch(null),
});

/** Família (PDM) de um item do CATMAT. */
export interface FamiliaMaterial {
  codigo: number;
  /** Nome da família ("IMPRESSORA MULTIFUNCIONAL") — usado para conferir aderência ao termo. */
  nome: string | null;
}

/** Preço homologado de material, já validado. */
export interface PrecoMaterialPainel {
  idCompra: string;
  numeroItemCompra: number | null;
  codigoPdm: number | null;
  descricaoItem: string;
  unidade: string;
  quantidade: number;
  precoUnitario: number;
  marca: string | null;
  nomeFornecedor: string | null;
  nomeOrgao: string;
  estado: string | null;
  municipio: string | null;
  /** Código de modalidade do Compras.gov (5 = pregão, 6 = dispensa, 7 = inexigibilidade). */
  modalidade: number | null;
  dataResultado: Date;
}

export interface ConsultaPrecosMaterial {
  codigoPdm: number;
  dataInicio: Date;
  dataFim: Date;
  /** Sigla da UF em maiúsculas — valor inválido devolve ZERO sem erro (medido). Validar antes. */
  estado?: string;
  /** `F`, `E` ou `M` — valor inválido devolve ZERO sem erro (medido). Validar antes. */
  esfera?: string;
}

// ── Utilitários ─────────────────────────────────────────────────────────────

/**
 * Cita `idCompra` / `idCompraItem` numéricos no texto bruto, antes do
 * `JSON.parse`, para que o número de 17 dígitos chegue intacto como string.
 * Exportada só para o teste que prova a correção contra o arredondamento.
 */
export function citarIdsGrandes(textoJson: string): string {
  return textoJson.replace(/"(idCompra|idCompraItem)"\s*:\s*(\d+)/g, '"$1":"$2"');
}

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function dataPlausivel(bruta: string | null | undefined): Date | null {
  if (!bruta?.trim()) return null;
  const data = new Date(bruta);
  if (Number.isNaN(data.getTime())) return null;
  if (data < DATA_REFERENCIA_MINIMA || data >= DATA_REFERENCIA_MAXIMA) return null;
  return data;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET com teto por requisição e retry curto em erro de rede/5xx. Devolve
 * `null` para 4xx (parâmetro recusado). Lança se todas as tentativas falharem
 * por rede ou 5xx — o chamador precisa distinguir "fonte fora do ar" de
 * "fonte respondeu vazio" (CLAUDE.md §9.93, §9.103).
 */
async function buscarTexto(url: string): Promise<string | null> {
  let ultimoErro: unknown = null;
  let limitado = false;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    limitado = false;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_REQUISICAO_MS),
      });
      if (res.ok) return await res.text();
      // 429 é limite de requisições: a fonte NÃO respondeu. Tratá-lo como 4xx
      // comum devolvia "sem preço" para um termo que tem centenas — medido em
      // 2026-11-09 com "cartucho toner HP" (§9.103). Conta como falha e tenta de novo.
      if (res.status === 429) {
        limitado = true;
        ultimoErro = new Error("HTTP 429 (limite de requisições do Compras.gov)");
      } else if (res.status < 500) {
        console.warn(`[ComprasGovMateriais] HTTP ${res.status}: ${url}`);
        return null;
      } else {
        ultimoErro = new Error(`HTTP ${res.status}`);
      }
    } catch (erro) {
      ultimoErro = erro;
    }
    // Limite de requisições não passa em meio segundo (§9.109): espera mais antes da 2ª tentativa.
    if (tentativa < MAX_TENTATIVAS) await esperar(limitado ? BACKOFF_LIMITE_MS : BACKOFF_MS);
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro));
}

// ── Prova de homologação no PNCP ────────────────────────────────────────────

const contratacaoPncpPorIdSchema = z.object({
  orgaoEntidadeCnpj: z.string().nullish().catch(null),
  anoCompraPncp: z.union([z.number(), z.string()]).nullish().catch(null),
  sequencialCompraPncp: z.union([z.number(), z.string()]).nullish().catch(null),
  existeResultado: z.boolean().nullish().catch(null),
  valorTotalHomologado: z.number().nullish().catch(null),
  contratacaoExcluida: z.boolean().nullish().catch(null),
});

const cacheHomologacao = new Map<string, Promise<string | null>>();

/**
 * URL do edital no PNCP **se** a compra estiver lá homologada (`existeResultado`
 * + valor homologado > 0, §9.76); `null` se não estiver homologada ou não
 * estiver no PNCP. **Lança** se a consulta falhar (rede, 5xx, 429).
 *
 * Existe à parte de `resolverUrlPublicaPorIdCompra` (`comprasGov.ts`) de
 * propósito: aquela trata falha da consulta (inclusive 429) como "compra fora
 * do PNCP" e cai no link de acompanhamento SEM a checagem de resultado — sob
 * limite de requisições, um preço não homologado passaria. Aqui, falha não vira
 * aprovação: quem chama descarta o candidato.
 */
export function urlEditalHomologadoPncp(idCompra: string): Promise<string | null> {
  const id = idCompra.trim();
  const emCache = cacheHomologacao.get(id);
  if (emCache) return emCache;

  const pendente = (async () => {
    const params = new URLSearchParams({ tipo: "idCompra", codigo: id });
    const texto = await buscarTexto(
      `${BASE_URL}/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id?${params}`,
    );
    if (!texto) return null;
    const pagina = respostaPaginadaSchema.safeParse(JSON.parse(citarIdsGrandes(texto)));
    if (!pagina.success) return null;
    const item = contratacaoPncpPorIdSchema.safeParse(pagina.data.resultado[0]);
    if (!item.success) return null;
    const status = statusHomologacaoPncp(item.data);
    return status.kind === "homologada" ? status.url : null;
  })();

  pendente.catch(() => cacheHomologacao.delete(id));
  cacheHomologacao.set(id, pendente);
  return pendente;
}

// ── Código da família (PDM) de um item CATMAT ───────────────────────────────

const cachePdm = new Map<number, Promise<FamiliaMaterial | null>>();

/**
 * Família (PDM) de um item CATMAT. O catálogo ingerido em
 * `ItemCatalogoReferencia` não guarda o PDM, então ele vem da API
 * (`4_consultarItemMaterial`, ~0,2s medido). Cache por instância: o mesmo
 * código aparece em toda busca de objetos parecidos. Lança se a fonte não
 * responder (inclusive 429) — ver `buscarTexto`.
 */
export function consultarPdmDoItemCatmat(codigoItem: number): Promise<FamiliaMaterial | null> {
  const emCache = cachePdm.get(codigoItem);
  if (emCache) return emCache;

  const pendente = (async () => {
    const params = new URLSearchParams({
      pagina: "1",
      tamanhoPagina: "10",
      codigoItem: String(codigoItem),
    });
    const texto = await buscarTexto(
      `${BASE_URL}/modulo-material/4_consultarItemMaterial?${params}`,
    );
    if (!texto) return null;
    const pagina = respostaPaginadaSchema.safeParse(JSON.parse(texto));
    if (!pagina.success) return null;
    const item = itemMaterialCatalogoSchema.safeParse(pagina.data.resultado[0]);
    if (!item.success || item.data.codigoPdm == null) return null;
    return { codigo: item.data.codigoPdm, nome: item.data.nomePdm?.trim() || null };
  })();

  // Falha não fica em cache: a próxima busca tenta de novo.
  pendente.catch(() => cachePdm.delete(codigoItem));
  cachePdm.set(codigoItem, pendente);
  return pendente;
}

// ── Preços homologados por família ──────────────────────────────────────────

function mapearPreco(bruto: unknown): PrecoMaterialPainel | null {
  const parse = precoMaterialApiSchema.safeParse(bruto);
  if (!parse.success) return null;
  const p = parse.data;

  const idCompra = p.idCompra?.trim();
  const descricao = p.descricaoItem?.trim();
  const orgao = (p.nomeOrgao || p.nomeUasg)?.trim();
  // Só preço homologado entra (CLAUDE.md §9.61, §9.76): resultado com data
  // verdadeira e valor positivo. Sem `idCompra` não há como provar a
  // homologação no PNCP nem montar evidência — a linha não serve.
  const dataResultado = dataPlausivel(p.dataResultado);
  if (!idCompra || !descricao || !orgao || !dataResultado) return null;
  if (typeof p.precoUnitario !== "number" || p.precoUnitario <= 0) return null;

  return {
    idCompra,
    numeroItemCompra: p.numeroItemCompra ?? null,
    codigoPdm: p.codigoPdm ?? null,
    descricaoItem: descricao,
    unidade: p.siglaUnidadeFornecimento || p.nomeUnidadeFornecimento || "UN",
    quantidade: p.quantidade && p.quantidade > 0 ? p.quantidade : 1,
    precoUnitario: p.precoUnitario,
    marca: p.marca?.trim() || null,
    nomeFornecedor: p.nomeFornecedor?.trim() || null,
    nomeOrgao: orgao,
    estado: p.estado ?? null,
    municipio: p.municipio ?? null,
    modalidade: p.modalidade ?? null,
    dataResultado,
  };
}

/**
 * Preços homologados de uma família de material (página 1, até 500 linhas,
 * mais recentes primeiro). Lança se a fonte não responder — ver `buscarTexto`.
 */
export async function buscarPrecosMaterialPorPdm(
  consulta: ConsultaPrecosMaterial,
): Promise<PrecoMaterialPainel[]> {
  const params = new URLSearchParams({
    pagina: "1",
    tamanhoPagina: String(TAMANHO_PAGINA),
    tipo: "codigoPdm",
    codigo: String(consulta.codigoPdm),
    dataCompraInicio: formatarData(consulta.dataInicio),
    dataCompraFim: formatarData(consulta.dataFim),
  });
  if (consulta.estado) params.set("estado", consulta.estado);
  if (consulta.esfera) params.set("esfera", consulta.esfera);

  const texto = await buscarTexto(
    `${BASE_URL}/modulo-pesquisa-preco/1_consultarMaterial?${params}`,
  );
  if (!texto) return [];

  const pagina = respostaPaginadaSchema.safeParse(JSON.parse(citarIdsGrandes(texto)));
  if (!pagina.success) {
    console.warn("[ComprasGovMateriais] Resposta fora do formato esperado:", pagina.error.message);
    return [];
  }

  return pagina.data.resultado.map(mapearPreco).filter((p): p is PrecoMaterialPainel => p !== null);
}
