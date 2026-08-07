import "server-only";
import { z } from "zod";
import { cnpjOrgaoProprio, normalizarCnpj } from "@/lib/domain/orgaoProprio";
import { processarComConcorrencia } from "@/lib/similaridade/processarComConcorrencia";

/**
 * Cliente para `modulo-contratacoes` da API de Dados Abertos do Compras.gov.br
 * (dadosabertos.compras.gov.br), que expõe itens de contratações regidas pela
 * Lei 14.133 com o número de controle PNCP embutido.
 *
 * Fecha a lacuna de material de consumo e TI/equipamentos (cobertura zero na
 * integração existente, `comprasGov.ts`, que só cobre o catálogo CATSER de
 * serviços) e resolve num único request o que o cliente do PNCP faz hoje com
 * N+1 chamadas a `/itens/{n}/resultados` (ver `pncp.ts`): o registro já traz
 * `valorUnitarioEstimado` e `valorUnitarioResultado` lado a lado.
 *
 * Fatos usados abaixo vêm do spike medido contra a API real em 2026-08-06
 * (registrado em `docs/ApiPlan.md`, §4.1) — não são dedução:
 * - o envelope de paginação é `{ resultado, totalRegistros, totalPaginas,
 *   paginasRestantes }`, sem truncamento silencioso (ao contrário de
 *   `/itens` do PNCP — CLAUDE.md §9.61b);
 * - o preço de referência é `valorUnitarioResultado` (homologado), nunca
 *   `valorUnitarioEstimado` (CLAUDE.md §9.61a) — o spike mediu até 41% de
 *   diferença entre os dois no mesmo item;
 * - a janela de consulta aceita no máximo 365 dias, com erro explícito acima
 *   disso;
 * - `idContratacaoPNCP` vem no formato `"{cnpj}-{tipo}-{sequencial}/{ano}"`
 *   (ex.: `"13672605000170-1-000119/2025"`), de onde se deriva a mesma URL de
 *   evidência que `montarUrlEdital()` em `pncp.ts` produz a partir de outro
 *   campo de origem.
 *
 * **Correção de 2026-08-07, contra a API real e o OpenAPI (`/v3/api-docs`) do backend** — o spike
 * original não havia capturado o payload exato da requisição nem o schema completo do item, e a
 * primeira versão deste módulo adivinhou nomes de campo que **não existem** na API real:
 * - Parâmetros de data são **`dataInclusaoPncpInicial`/`dataInclusaoPncpFinal`** (obrigatórios,
 *   confirmado como `required: true` no OpenAPI e por uma chamada real HTTP 200), não
 *   `dataInicial`/`dataFinal` — a versão anterior teria devolvido erro em toda chamada real.
 * - O campo de descrição é **`descricaoResumida`**, não `descricaoItem` (que não existe na
 *   resposta) — a versão anterior sempre gravaria descrição vazia.
 * - **`orgaoEntidadeRazaoSocial` não existe** na resposta (confirmado no OpenAPI e numa amostra
 *   real) — removido; só `orgaoEntidadeCnpj` está disponível para identificar o órgão.
 * - **`dataCancelamentoPncp` não existe** — não há campo de data de cancelamento nesta API. O
 *   sinal mais próximo é `situacaoCompraItemNome` (texto livre, sem enum documentado); ver
 *   `mapearItem()` para o tratamento (heurística, não confirmada com um exemplo cancelado real).
 * - Existe **`unidadeMedida`** (string, ex. `"Unidade  "` — com espaços à direita observados na
 *   amostra real, por isso o `.trim()` na mensagem).
 *
 * Fatos que seguem confirmados (spike original §4.1 + esta correção):
 * - o envelope de paginação é `{ resultado, totalRegistros, totalPaginas,
 *   paginasRestantes }`, sem truncamento silencioso (ao contrário de
 *   `/itens` do PNCP — CLAUDE.md §9.61b);
 * - o preço de referência é `valorUnitarioResultado` (homologado), nunca
 *   `valorUnitarioEstimado` (CLAUDE.md §9.61a) — o spike mediu até 41% de
 *   diferença entre os dois no mesmo item;
 * - a janela de consulta aceita no máximo 365 dias, com erro explícito acima
 *   disso;
 * - `idContratacaoPNCP` vem no formato `"{cnpj}-{tipo}-{sequencial}/{ano}"`
 *   (ex.: `"13672605000170-1-000119/2025"`), de onde se deriva a mesma URL de
 *   evidência que `montarUrlEdital()` em `pncp.ts` produz a partir de outro
 *   campo de origem — confirmado também que `numeroControlePNCPCompra` traz o
 *   mesmo valor, como campo alternativo caso `idContratacaoPNCP` falte algum dia.
 */

const BASE_URL = "https://dadosabertos.compras.gov.br";
const ENDPOINT = "/modulo-contratacoes/2_consultarItensContratacoes_PNCP_14133";

const MAX_TENTATIVAS = 3;
const BACKOFF_BASE_MS = 800;

// Teto confirmado pelo spike (§4.1b): a API aceita de 10 a 500.
const TAMANHO_PAGINA = 500;
// Trava de segurança contra paginação infinita se a API mudar de contrato.
const MAX_PAGINAS_POR_JANELA = 40;

// A API rejeita janela de consulta acima de 365 dias com erro explícito
// (spike §4.1e) — períodos maiores são divididos em janelas móveis.
const JANELA_MAX_DIAS = 365;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Janelas rodam em paralelo, mas com concorrência limitada: cada uma já pagina
// internamente, e disparar todas de uma vez para um período de vários anos
// multiplicaria as requisições simultâneas (CLAUDE.md §9.11).
const LOTE_JANELAS = 3;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

// ── Validação da resposta (fronteira externa — CLAUDE.md, regra de domínio) ──

const itemContratacaoApiSchema = z.object({
  codItemCatalogo: z.number().nullish(),
  codigoClasse: z.number().nullish(),
  descricaoResumida: z.string().nullish(),
  unidadeMedida: z.string().nullish(),
  valorUnitarioEstimado: z.number().nullish(),
  valorUnitarioResultado: z.number().nullish(),
  quantidadeResultado: z.number().nullish(),
  dataResultado: z.string().nullish(),
  temResultado: z.boolean().nullish(),
  situacaoCompraItemNome: z.string().nullish(),
  orgaoEntidadeCnpj: z.string().nullish(),
  nomeFornecedor: z.string().nullish(),
  idContratacaoPNCP: z.string().nullish(),
});

type ItemContratacaoApi = z.infer<typeof itemContratacaoApiSchema>;

const respostaPaginadaSchema = z.object({
  resultado: z.array(itemContratacaoApiSchema).default([]),
  totalRegistros: z.number().nullish(),
  totalPaginas: z.number().nullish(),
  paginasRestantes: z.number().nullish(),
});

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
            `[ComprasGovContratacoes] Resposta fora do formato esperado: ${url}`,
            validado.error,
          );
          return null;
        }
        return validado.data;
      }

      const retryavel = res.status === 429 || res.status >= 500;
      if (!retryavel || tentativa === MAX_TENTATIVAS) {
        console.warn(`[ComprasGovContratacoes] HTTP ${res.status}: ${url}`);
        return null;
      }
      console.warn(
        `[ComprasGovContratacoes] HTTP ${res.status} (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${url}`,
      );
    } catch (err) {
      ultimoErro = err;
      if (tentativa === MAX_TENTATIVAS) throw err;
      console.warn(
        `[ComprasGovContratacoes] Falha de rede (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${url}`,
        err,
      );
    }
    await esperar(BACKOFF_BASE_MS * 2 ** (tentativa - 1));
  }
  return ultimoErro ? Promise.reject(ultimoErro) : null;
}

// ── Janelas de até 365 dias ───────────────────────────────────────────────────

export interface PeriodoConsulta {
  dataInicial: Date;
  dataFinal: Date;
}

/** Divide o período pedido em janelas móveis de até JANELA_MAX_DIAS dias. */
function dividirEmJanelas(periodo: PeriodoConsulta): PeriodoConsulta[] {
  if (periodo.dataInicial > periodo.dataFinal) return [];

  const janelas: PeriodoConsulta[] = [];
  let inicioAtual = periodo.dataInicial;

  while (inicioAtual <= periodo.dataFinal) {
    const fimJanela = new Date(
      Math.min(
        inicioAtual.getTime() + (JANELA_MAX_DIAS - 1) * MS_POR_DIA,
        periodo.dataFinal.getTime(),
      ),
    );
    janelas.push({ dataInicial: inicioAtual, dataFinal: fimJanela });
    inicioAtual = new Date(fimJanela.getTime() + MS_POR_DIA);
  }

  return janelas;
}

// ── Busca paginada por janela ─────────────────────────────────────────────────

export interface FiltroItensContratacoesCompraGov {
  codItemCatalogo?: number;
  codigoClasse?: number;
}

function montarUrl(
  filtro: FiltroItensContratacoesCompraGov,
  janela: PeriodoConsulta,
  pagina: number,
): string {
  const params = new URLSearchParams({
    pagina: String(pagina),
    tamanhoPagina: String(TAMANHO_PAGINA),
    dataInclusaoPncpInicial: formatarData(janela.dataInicial),
    dataInclusaoPncpFinal: formatarData(janela.dataFinal),
  });
  if (filtro.codItemCatalogo !== undefined) {
    params.set("codItemCatalogo", String(filtro.codItemCatalogo));
  }
  if (filtro.codigoClasse !== undefined) {
    params.set("codigoClasse", String(filtro.codigoClasse));
  }
  return `${BASE_URL}${ENDPOINT}?${params.toString()}`;
}

/** Percorre todas as páginas de uma janela até `paginasRestantes === 0`. */
async function buscarItensDaJanela(
  filtro: FiltroItensContratacoesCompraGov,
  janela: PeriodoConsulta,
): Promise<ItemContratacaoApi[]> {
  const todos: ItemContratacaoApi[] = [];

  for (let pagina = 1; pagina <= MAX_PAGINAS_POR_JANELA; pagina++) {
    const url = montarUrl(filtro, janela, pagina);
    const resposta = await buscarJSON(url, respostaPaginadaSchema);
    if (!resposta) break;

    todos.push(...resposta.resultado);
    if ((resposta.paginasRestantes ?? 0) <= 0) break;
  }

  return todos;
}

// ── Mapeamento e regras de conformidade ───────────────────────────────────────

export interface ItemContratacaoCompraGov {
  codItemCatalogo: number | null;
  codigoClasse: number | null;
  descricaoItem: string;
  /** `unidadeMedida` da API, aparada — a amostra real trouxe espaços à direita (ex. "Unidade  "). */
  unidade: string;
  /** Preço efetivamente contratado (homologado) — nunca o estimado. */
  valorUnitarioResultado: number;
  quantidadeHomologada: number;
  dataResultado: Date;
  /** Único identificador de órgão disponível nesta API — não há campo de razão social. */
  orgaoEntidadeCnpj: string;
  nomeFornecedorVencedor: string;
  /** https://pncp.gov.br/app/editais/{cnpj}/{ano}/{sequencial} — derivada de idContratacaoPNCP. */
  fonteUrl: string;
  /** Formato original da API: "{cnpj}-{tipo}-{sequencial}/{ano}". */
  idContratacaoPNCP: string;
}

/**
 * Deriva a URL de evidência do formato `"{cnpj}-{tipo}-{sequencial}/{ano}"`
 * (ex.: `"13672605000170-1-000119/2025"`) para
 * `https://pncp.gov.br/app/editais/{cnpj}/{ano}/{sequencial}` — mesma URL
 * final que `montarUrlEdital()` em `pncp.ts` produz a partir da busca textual,
 * agora a partir de um campo de origem diferente. O sequencial perde os
 * zeros à esquerda (`"000119"` → `"119"`), como no exemplo medido no spike.
 */
function montarUrlEvidencia(idContratacaoPNCP: string): string | null {
  const match = /^(\d{14})-\d+-(\d+)\/(\d{4})$/.exec(idContratacaoPNCP);
  if (!match) return null;
  const [, cnpj, sequencialComZeros, ano] = match;
  const sequencial = String(Number(sequencialComZeros));
  return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${sequencial}`;
}

// Não existe campo de data/flag de cancelamento nesta API (ver correção de 2026-08-07 no
// cabeçalho do arquivo) — `situacaoCompraItemNome` é o único texto de status disponível, sem enum
// documentado. Heurística de string, não confirmada contra um exemplo real cancelado: melhor
// filtrar candidato demais do que deixar passar um item cancelado na estimativa de preço.
const REGEX_STATUS_CANCELADO = /cancelad/i;

/**
 * Aplica as regras de conformidade e devolve `null` quando o item não pode
 * virar candidato de preço: sem resultado homologado, contratação cancelada,
 * sem valor efetivamente contratado, do próprio órgão (IN 65/2021, CLAUDE.md
 * §9.9) ou sem evidência derivável (CLAUDE.md §9.8) — nenhum preço entra sem
 * fonte + data + evidência.
 */
function mapearItem(raw: ItemContratacaoApi): ItemContratacaoCompraGov | null {
  if (raw.temResultado !== true) return null;
  if (raw.situacaoCompraItemNome && REGEX_STATUS_CANCELADO.test(raw.situacaoCompraItemNome)) {
    return null;
  }
  if (typeof raw.valorUnitarioResultado !== "number" || raw.valorUnitarioResultado <= 0) {
    return null;
  }

  const cnpjOrgao = normalizarCnpj(raw.orgaoEntidadeCnpj);
  if (!cnpjOrgao || cnpjOrgao === cnpjOrgaoProprio()) return null;

  if (!raw.idContratacaoPNCP) return null;
  const fonteUrl = montarUrlEvidencia(raw.idContratacaoPNCP);
  if (!fonteUrl) return null;

  if (!raw.dataResultado) return null;
  const dataResultado = new Date(raw.dataResultado);
  if (Number.isNaN(dataResultado.getTime())) return null;

  return {
    codItemCatalogo: raw.codItemCatalogo ?? null,
    codigoClasse: raw.codigoClasse ?? null,
    descricaoItem: (raw.descricaoResumida ?? "").trim(),
    unidade: (raw.unidadeMedida ?? "").trim(),
    valorUnitarioResultado: raw.valorUnitarioResultado,
    quantidadeHomologada: raw.quantidadeResultado ?? 1,
    dataResultado,
    orgaoEntidadeCnpj: cnpjOrgao,
    nomeFornecedorVencedor: raw.nomeFornecedor ?? "",
    fonteUrl,
    idContratacaoPNCP: raw.idContratacaoPNCP,
  };
}

// ── Ponto de entrada público ──────────────────────────────────────────────────

/**
 * Busca itens de contratações da Lei 14.133 no `modulo-contratacoes` do
 * Compras.gov.br, filtrados por catálogo (CATMAT) e/ou classe, dentro do
 * período informado.
 *
 * Períodos acima de 365 dias são divididos em janelas móveis e agregados
 * (a API rejeita janela maior com erro explícito — spike §4.1e). Devolve
 * apenas itens com resultado homologado, não cancelados, de fora do próprio
 * órgão e com URL de evidência derivável — os mesmos critérios que tornam um
 * candidato utilizável na estimativa de preço (IN 65/2021).
 */
export async function buscarItensContratacoesCompraGov(
  filtro: FiltroItensContratacoesCompraGov,
  periodo: PeriodoConsulta,
): Promise<ItemContratacaoCompraGov[]> {
  if (filtro.codItemCatalogo === undefined && filtro.codigoClasse === undefined) {
    console.warn(
      "[ComprasGovContratacoes] Busca sem codItemCatalogo nem codigoClasse — ignorada para não " +
        "varrer o universo inteiro de contratações.",
    );
    return [];
  }

  try {
    const janelas = dividirEmJanelas(periodo);
    const porJanela = await processarComConcorrencia(
      janelas,
      LOTE_JANELAS,
      (janela) => buscarItensDaJanela(filtro, janela),
      (janela, erro) =>
        console.warn(
          `[ComprasGovContratacoes] Erro na janela ${formatarData(janela.dataInicial)}–` +
            `${formatarData(janela.dataFinal)}:`,
          erro,
        ),
    );

    const brutos = porJanela.filter((r): r is ItemContratacaoApi[] => Array.isArray(r)).flat();

    const itens: ItemContratacaoCompraGov[] = [];
    for (const raw of brutos) {
      const mapeado = mapearItem(raw);
      if (mapeado) itens.push(mapeado);
    }
    return itens;
  } catch (err) {
    console.error("[ComprasGovContratacoes] Erro inesperado ao buscar itens de contratações:", err);
    return [];
  }
}
