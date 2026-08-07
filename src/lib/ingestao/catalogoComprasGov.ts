import { z } from "zod";
import { db } from "@/lib/db";
import { normalizar } from "@/lib/similaridade/texto";
import { processarComConcorrencia } from "@/lib/similaridade/processarComConcorrencia";
import { calcularChecksumSha256 } from "./checksum";

/**
 * Ingestão dos catálogos CATMAT (materiais) e CATSER (serviços) do
 * Compras.gov.br para `ItemCatalogoReferencia` (docs/ApiPlan.md §4.2).
 *
 * **Sem `import "server-only"`** — ver o comentário equivalente em
 * `fontesComprasGov.ts`: este módulo roda a partir de
 * `scripts/ingerir-catalogo-compras-gov.ts` via `tsx`, ambiente em que o
 * marcador `server-only` lança exceção ao ser importado (não declara a
 * condição `react-server` que o Next usa para liberá-lo). Nenhum dos dois
 * módulos é alcançável a partir de `components/`.
 *
 * Fatos usados abaixo, medidos contra a API real em 2026-08-07:
 * - envelope `{ resultado, totalRegistros, totalPaginas, paginasRestantes }`,
 *   idêntico ao de `modulo-contratacoes` (CLAUDE.md §9.61b não se aplica: dá
 *   para saber quando a paginação acabou);
 * - `tamanhoPagina` aceita 10–500 e rejeita fora da faixa com erro explícito;
 * - CATMAT (`/modulo-material/4_consultarItemMaterial`) tem 343.880 itens —
 *   688 páginas de 500. CATSER (`/modulo-servico/6_consultarItemServico`)
 *   tem ~3.100 (7 páginas), já consultado por request em `comprasGov.ts`;
 * - nenhum dos dois endpoints tem campo de preço — só identidade do item
 *   (código, descrição, classe, status ativo/inativo).
 *
 * Este módulo não busca por texto livre (a API não oferece — confirmado no
 * spike do M16, docs/ApiPlan.md §4.1e): grava o catálogo inteiro para que o
 * matching local (sobreposição léxica, próxima etapa) rode sobre a tabela.
 */

const BASE_URL = "https://dadosabertos.compras.gov.br";

const MAX_TENTATIVAS = 3;
const BACKOFF_BASE_MS = 800;

// Teto confirmado pelo spike (docs/ApiPlan.md §4.1b/§4.2).
const TAMANHO_PAGINA = 500;

// Concorrência de páginas simultâneas (CLAUDE.md §9.11 — nunca sequencial
// puro). 5 é o mesmo valor usado como ponto de partida noutras integrações
// deste projeto para chamadas em lote a APIs públicas sem SLA documentado;
// não há medição própria que justifique um número maior, e um número maior
// arrisca 429 num scan de centenas de páginas.
const CONCORRENCIA_PADRAO = 5;

// Trava de segurança contra paginação sem fim caso a API mude de contrato e
// pare de reportar `paginasRestantes` corretamente (mesmo espírito de
// `MAX_PAGINAS_POR_JANELA` em `comprasGovContratacoes.ts`). Acima do maior
// catálogo já medido (CATMAT, 688 páginas) com folga.
const MAX_PAGINAS_SEGURANCA = 2000;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Envelope de paginação (fronteira externa — validado com Zod) ────────────

function schemaRespostaPaginada<T>(itemSchema: z.ZodType<T>) {
  return z.object({
    resultado: z.array(itemSchema).default([]),
    totalRegistros: z.number().nullish(),
    totalPaginas: z.number().nullish(),
    paginasRestantes: z.number().nullish(),
  });
}

async function buscarJSON<T>(url: string, schema: z.ZodType<T>): Promise<T | null> {
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) {
        const corpo: unknown = await res.json();
        const validado = schema.safeParse(corpo);
        if (!validado.success) {
          console.error(
            `[CatalogoComprasGov] Resposta fora do formato esperado: ${url}`,
            validado.error,
          );
          return null;
        }
        return validado.data;
      }

      const retryavel = res.status === 429 || res.status >= 500;
      if (!retryavel || tentativa === MAX_TENTATIVAS) {
        console.warn(`[CatalogoComprasGov] HTTP ${res.status}: ${url}`);
        return null;
      }
      console.warn(
        `[CatalogoComprasGov] HTTP ${res.status} (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${url}`,
      );
    } catch (err) {
      ultimoErro = err;
      if (tentativa === MAX_TENTATIVAS) throw err;
      console.warn(
        `[CatalogoComprasGov] Falha de rede (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${url}`,
        err,
      );
    }
    await esperar(BACKOFF_BASE_MS * 2 ** (tentativa - 1));
  }
  return ultimoErro ? Promise.reject(ultimoErro) : null;
}

// ── Itens crus por fonte ──────────────────────────────────────────────────

const catmatItemSchema = z.object({
  codigoItem: z.number(),
  codigoClasse: z.number().nullish(),
  descricaoItem: z.string().nullish(),
  statusItem: z.boolean().nullish(),
});
type CatmatItemRaw = z.infer<typeof catmatItemSchema>;

const catserItemSchema = z.object({
  codigoServico: z.number(),
  codigoClasse: z.number().nullish(),
  nomeServico: z.string().nullish(),
  statusServico: z.boolean().nullish(),
});
type CatserItemRaw = z.infer<typeof catserItemSchema>;

export interface ItemCatalogoNormalizado {
  codigo: number;
  codigoClasse: number | null;
  descricao: string;
  descricaoNormalizada: string;
  ativo: boolean;
}

export interface ConfigFonteCatalogo<TRaw> {
  fonteChave: "catmat" | "catser";
  endpoint: string;
  schemaItem: z.ZodType<TRaw>;
  mapear: (raw: TRaw) => ItemCatalogoNormalizado | null;
}

function normalizarItemComum(
  codigo: number | null | undefined,
  codigoClasse: number | null | undefined,
  descricaoBruta: string | null | undefined,
  ativo: boolean | null | undefined,
): ItemCatalogoNormalizado | null {
  if (typeof codigo !== "number" || !Number.isFinite(codigo)) return null;
  const descricao = descricaoBruta?.trim();
  if (!descricao) return null;

  return {
    codigo,
    codigoClasse: codigoClasse ?? null,
    descricao,
    descricaoNormalizada: normalizar(descricao),
    ativo: ativo ?? true,
  };
}

export const CONFIG_CATALOGO_CATMAT: ConfigFonteCatalogo<CatmatItemRaw> = {
  fonteChave: "catmat",
  endpoint: "/modulo-material/4_consultarItemMaterial",
  schemaItem: catmatItemSchema,
  mapear: (raw) =>
    normalizarItemComum(raw.codigoItem, raw.codigoClasse, raw.descricaoItem, raw.statusItem),
};

export const CONFIG_CATALOGO_CATSER: ConfigFonteCatalogo<CatserItemRaw> = {
  fonteChave: "catser",
  endpoint: "/modulo-servico/6_consultarItemServico",
  schemaItem: catserItemSchema,
  mapear: (raw) =>
    normalizarItemComum(raw.codigoServico, raw.codigoClasse, raw.nomeServico, raw.statusServico),
};

// ── Busca paginada ───────────────────────────────────────────────────────

function montarUrl(endpoint: string, pagina: number): string {
  const params = new URLSearchParams({
    pagina: String(pagina),
    tamanhoPagina: String(TAMANHO_PAGINA),
  });
  return `${BASE_URL}${endpoint}?${params.toString()}`;
}

interface ContadorPagina {
  lidas: number;
  importadas: number;
  rejeitadas: number;
}

/** Normaliza e grava (em lote, com `skipDuplicates`) os itens de uma página já buscada. */
async function gravarPagina<TRaw>(
  config: ConfigFonteCatalogo<TRaw>,
  itensBrutos: TRaw[],
): Promise<ContadorPagina> {
  const validos: ItemCatalogoNormalizado[] = [];
  let rejeitadas = 0;

  for (const bruto of itensBrutos) {
    const normalizado = config.mapear(bruto);
    if (normalizado) validos.push(normalizado);
    else rejeitadas++;
  }

  let importadas = 0;
  if (validos.length > 0) {
    const resultado = await db.itemCatalogoReferencia.createMany({
      data: validos.map((item) => ({
        fonteChave: config.fonteChave,
        codigo: item.codigo,
        codigoClasse: item.codigoClasse,
        descricao: item.descricao,
        descricaoNormalizada: item.descricaoNormalizada,
        ativo: item.ativo,
      })),
      skipDuplicates: true,
    });
    importadas = resultado.count;
  }

  return { lidas: itensBrutos.length, importadas, rejeitadas };
}

export interface OpcoesIngestaoCatalogo {
  /** Limita quantas páginas buscar — só para teste manual/local (docs/ApiPlan.md, M16). */
  maxPaginas?: number;
  /** Concorrência de páginas simultâneas. Default `CONCORRENCIA_PADRAO` (CLAUDE.md §9.11). */
  concorrencia?: number;
}

export interface ResumoIngestaoCatalogo {
  loteId: string;
  fonteChave: string;
  totalPaginas: number;
  paginasProcessadas: number;
  linhasLidas: number;
  linhasImportadas: number;
  linhasRejeitadas: number;
}

/**
 * Baixa e grava o catálogo inteiro (ou as primeiras `opcoes.maxPaginas`
 * páginas, para teste) da fonte informada em `ItemCatalogoReferencia`.
 *
 * Exige que a `FonteReferencia` correspondente já exista e esteja ativa —
 * rodar `garantirFontesCatalogoComprasGov()` antes (`fontesComprasGov.ts`).
 *
 * Cria um `LoteIngestao` no início e o atualiza no fim com os contadores
 * (`linhasLidas`/`linhasImportadas`/`linhasRejeitadas`/`concluidoEm`), para
 * manter o mesmo rastro de auditoria que o runner genérico do M15 produz
 * (`runner.ts`) — sem reusar o runner em si, que é hardcoded para
 * `PrecoReferencia` (docs/ApiPlan.md §4.2: catálogo sem preço não cabe lá).
 *
 * `LoteIngestao.checksum` normalmente identifica o arquivo baixado
 * (`calcularChecksumSha256` sobre o conteúdo bruto). Aqui não há um único
 * arquivo — é um scan paginado ao vivo — então o checksum é calculado sobre
 * os parâmetros e o tamanho do resultado desta rodada (fonte, endpoint,
 * total de registros/páginas, instante de início): serve para distinguir e
 * datar rodadas na auditoria, não para detectar reingestão byte-idêntica de
 * um arquivo (que não existe neste tipo de fonte).
 */
export async function ingerirCatalogoComprasGov<TRaw>(
  config: ConfigFonteCatalogo<TRaw>,
  opcoes: OpcoesIngestaoCatalogo = {},
): Promise<ResumoIngestaoCatalogo> {
  const concorrencia = opcoes.concorrencia ?? CONCORRENCIA_PADRAO;

  const fonte = await db.fonteReferencia.findUnique({
    where: { chave: config.fonteChave },
    select: { id: true, ativa: true },
  });
  if (!fonte) {
    throw new Error(
      `Fonte de referência "${config.fonteChave}" não cadastrada — rode ` +
        "garantirFontesCatalogoComprasGov() antes.",
    );
  }
  if (!fonte.ativa) {
    throw new Error(`Fonte de referência "${config.fonteChave}" está inativa.`);
  }

  const schemaResposta = schemaRespostaPaginada(config.schemaItem);
  const primeira = await buscarJSON(montarUrl(config.endpoint, 1), schemaResposta);
  if (!primeira) {
    throw new Error(
      `Não foi possível carregar a primeira página do catálogo "${config.fonteChave}".`,
    );
  }

  const totalPaginasReal = Math.max(1, primeira.totalPaginas ?? 1);
  const totalPaginas = Math.min(
    totalPaginasReal,
    opcoes.maxPaginas ?? totalPaginasReal,
    MAX_PAGINAS_SEGURANCA,
  );

  const iniciadoEm = new Date();
  const checksum = calcularChecksumSha256(
    Buffer.from(
      JSON.stringify({
        fonteChave: config.fonteChave,
        endpoint: config.endpoint,
        totalRegistros: primeira.totalRegistros ?? null,
        totalPaginas,
        iniciadoEm: iniciadoEm.toISOString(),
      }),
    ),
  );

  const lote = await db.loteIngestao.create({
    data: {
      fonteReferenciaId: fonte.id,
      competencia: iniciadoEm.toISOString().slice(0, 10),
      urlArquivo: `${BASE_URL}${config.endpoint}`,
      checksum,
      iniciadoEm,
    },
    select: { id: true },
  });

  // Página 1 já foi buscada acima — grava aqui em vez de refazer a requisição.
  const contadorPagina1 = await gravarPagina(config, primeira.resultado);

  const numerosDemaisPaginas = Array.from({ length: totalPaginas - 1 }, (_, i) => i + 2);

  const contadoresDemaisPaginas = await processarComConcorrencia(
    numerosDemaisPaginas,
    concorrencia,
    async (pagina) => {
      const resposta = await buscarJSON(montarUrl(config.endpoint, pagina), schemaResposta);
      if (!resposta) return { lidas: 0, importadas: 0, rejeitadas: 0 };
      return gravarPagina(config, resposta.resultado);
    },
    (pagina, erro) =>
      console.warn(
        `[CatalogoComprasGov] Erro na página ${pagina} (${config.fonteChave}):`,
        erro,
      ),
  );

  const todosContadores: ContadorPagina[] = [
    contadorPagina1,
    ...contadoresDemaisPaginas.filter((c): c is ContadorPagina => c !== undefined),
  ];

  const totais = todosContadores.reduce<ContadorPagina>(
    (acc, c) => ({
      lidas: acc.lidas + c.lidas,
      importadas: acc.importadas + c.importadas,
      rejeitadas: acc.rejeitadas + c.rejeitadas,
    }),
    { lidas: 0, importadas: 0, rejeitadas: 0 },
  );

  await db.loteIngestao.update({
    where: { id: lote.id },
    data: {
      linhasLidas: totais.lidas,
      linhasImportadas: totais.importadas,
      linhasRejeitadas: totais.rejeitadas,
      concluidoEm: new Date(),
    },
  });

  return {
    loteId: lote.id,
    fonteChave: config.fonteChave,
    totalPaginas,
    paginasProcessadas: todosContadores.length,
    linhasLidas: totais.lidas,
    linhasImportadas: totais.importadas,
    linhasRejeitadas: totais.rejeitadas,
  };
}
