import "server-only";
import { setMaxListeners } from "node:events";
import type { CandidatoSimilaridade, IdentidadeContratacao } from "@/lib/ia/types";
import { cnpjOrgaoProprio, normalizarCnpj } from "@/lib/domain/orgaoProprio";
import { tokenizar, raizPlural } from "@/lib/similaridade/texto";
import { processarComConcorrencia } from "@/lib/similaridade/processarComConcorrencia";

const PNCP_SEARCH_BASE_URL = "https://pncp.gov.br/api/search";
const PNCP_ITENS_BASE_URL = "https://pncp.gov.br/pncp-api/v1";

const TAMANHO_PAGINA = 20;

/**
 * Páginas da busca textual lidas em paralelo. Custam o mesmo tempo de parede que
 * uma só (~2,5s cada, todas simultâneas) porque o gargalo é latência, não banda.
 *
 * **Era 2, e a distribuição medida mostrou que 2 é onde o dado é pior.** Contado
 * contra a API real em 2026-08-26 para "cadeira giratoria ergonomica", editais
 * com julgamento por página: 5 · 12 · 9 · 16 — ou seja, a página 1 é a PIOR das
 * quatro e a 4 é a melhor. Ler até a 4 leva de 17 para 42 os editais que podem
 * render preço, 2,5x mais, sem custo de parede.
 *
 * O motivo é estrutural e vale registrar, porque contraria a intuição: a
 * `ordenacao=relevancia` do PNCP favorece edital recente e ainda ABERTO, que por
 * definição não tem preço homologado. Relevância textual e utilidade para
 * pesquisa de preço apontam em direções opostas neste endpoint.
 *
 * Página além do fim volta vazia, sem custo de processamento — o teto não
 * precisa se adaptar a termo com poucos resultados.
 */
const PAGINAS_BUSCA_TEXTUAL = 4;

/**
 * Páginas do índice de ATAS DE REGISTRO DE PREÇOS lidas em paralelo com as de
 * edital. A ata é indexada à parte no PNCP, e é a única forma de alcançar
 * compras que a busca por edital não devolve.
 *
 * Medido contra a API real em 2026-08-26, em 3 termos: cerca de **metade das
 * atas aponta para compras que a busca por edital não alcançou** (10 a 12
 * inéditas na página 1 de cada termo). Dessas compras inéditas, **8 em 10
 * renderam preço homologado** — rendimento alto, coerente com o fato de que uma
 * ata só existe depois da homologação.
 *
 * São 2 páginas, não 4, porque o limitante aqui não é descobrir compras e sim o
 * orçamento de `MAX_RESULTADOS_POR_BUSCA`: as 4 páginas de edital já entregam
 * mais compras processáveis do que o orçamento comporta. A página 2 de ata ainda
 * rendeu 7 a 18 inéditas por termo; ampliar depois é barato, mas só faz sentido
 * junto com o teto de resultados.
 */
const PAGINAS_BUSCA_ATA = 2;

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
 * Teto de tempo da busca inteira, como **prazo real**: um `AbortSignal` criado no
 * começo aborta toda requisição em voo quando vence, e nenhuma requisição nova
 * começa depois disso.
 *
 * A versão anterior só verificava o relógio ENTRE lotes, para não devolver um
 * subconjunto arbitrário dos itens de uma compra. O efeito medido em produção em
 * 2026-08-11: um lote iniciado aos 19,9s rodava até o fim, e o teto de 20s virava
 * **27,7s** — sozinho isso consumia o orçamento de 35s do turno do assistente e
 * derrubava a função no `maxDuration`, sem gravar nada.
 *
 * A garantia original continua valendo, por outro caminho: compra interrompida
 * pelo prazo é descartada INTEIRA (ver `buscarItensDaCompra`), nunca entregue pela
 * metade. Compras que terminaram entram; as que ficaram no meio somem.
 */
const TEMPO_MAX_BUSCA_MS = 12_000;

/**
 * Reserva mínima para começar um lote novo. Sem ela, um lote iniciado a 200ms do
 * fim é sempre descartado inteiro — pagamos as requisições e jogamos fora. 2s é
 * folga sobre o custo mínimo de uma compra (~1,4s de `/itens` + ~50ms por
 * resultado, medidos contra a API real).
 */
const RESERVA_LOTE_MS = 2_000;

/**
 * Teto global de consultas a `/resultados` por busca — o custo real, e o que o
 * teto de tempo sozinho não controla (rede rápida = mais requisições no mesmo
 * prazo, não menos trabalho).
 *
 * A hipótese de que o termo longo é que encarecia a busca **foi medida e não se
 * sustenta**: em 16 buscas reais de 2026-08, 6 tokens custaram 8,2s e 3 tokens
 * custaram 15,6s. O custo vem de quantos editais a busca textual devolve e de
 * quantos itens cada um tem, não do tamanho do termo.
 *
 * Era 120 (12 editais); aumentado para 150 junto com a busca em páginas
 * paralelas. O que este teto compra em EDITAIS depende de
 * `MAX_ITENS_RELEVANTES_POR_COMPRA`: com 10 itens/compra eram 15 editais, com 4
 * são ~37.
 *
 * **Desde 2026-08-26 este teto passou a ser a restrição que morde, e é onde
 * está a próxima folga.** Enquanto a busca lia 2 páginas sem descartar edital
 * sem julgamento, o pool processável era de ~28 editais e o teto de 37 sobrava;
 * com 4 páginas e o descarte (`temJulgamento`), o pool medido contra a API real
 * em 5 termos subiu para 139 → 289 editais, média de 58 por busca. Ou seja: o
 * limitante deixou de ser "quantos editais a busca encontra" e passou a ser
 * "quantos cabem no orçamento" — que é a troca desejada, mas significa que
 * mexer neste número agora tem efeito direto na cobertura, ao contrário de
 * antes. Só subir com medição de tempo junto: o teto de 12s (`TEMPO_MAX_BUSCA_MS`)
 * continua sendo o corte real.
 *
 * A busca nunca exibe mais que `MAX_SUGESTOES_POR_BUSCA` (25) candidatos, mas
 * os 25 precisam ser escolhidos de um conjunto amplo o bastante para conter os
 * bons: quem faz a escolha é `ordenarResultadoBusca`, no assistente.
 */
const MAX_RESULTADOS_POR_BUSCA = 150;

// **O padrão de `/itens` é 10 registros por página** — medido contra a API real em
// 2026-07-30, não documentado. Sem paginar, toda contratação com mais de 10 itens era
// truncada no décimo em silêncio: numa compra de 418 itens, enxergávamos 2,4% dela.
// 500 é o teto que a API aceita.
const ITENS_TAMANHO_PAGINA = 500;
// Trava de segurança contra paginação infinita se a API mudar de contrato.
const ITENS_MAX_PAGINAS = 20;

// Cada item relevante custa uma requisição a mais (o valor homologado vive em endpoint
// separado). O teto evita que uma única compra gigante monopolize o orçamento de tempo
// da função serverless. Era 40: com 20 editais possíveis isso autorizava 800 consultas
// a `/resultados` numa busca que exibe no máximo 25 candidatos.
//
// **Era 10, baixado para 4 em 2026-08-25 — o orçamento estava invertido.** Com 10 itens
// por compra, os 150 `/resultados` do teto global se esgotavam em 15 editais, e a tela de
// 25 vagas era preenchida pelos ~3 primeiros: um candidato ótimo no 7º edital nunca
// aparecia. Medido na régua (`scripts/avaliar-busca-pncp.ts`) contra o gabarito de cliques
// do analista: dos 8 editais que ele aprovou como fonte, 3 estavam nas posições 18, 18 e
// 23 da relevância do PNCP — fora do alcance. Profundidade dentro de um edital é o eixo
// errado quando o corte final é de 25 candidatos vindos de editais diferentes; o mesmo
// orçamento agora alcança ~37 editais.
//
// O que se perde: uma ata de registro de preços com muitos itens comparáveis passa a
// entregar 4 deles em vez de 10. É recuperável na tela — o picker de "outros itens desta
// licitação" (`listarItensDaCompraPNCP`) lista a ata inteira sob demanda, sem gastar
// orçamento de busca.
const LOTE_BUSCA_RESULTADOS = 5;
const MAX_ITENS_RELEVANTES_POR_COMPRA = 4;

/**
 * Janela de plausibilidade da data de referência. O PNCP devolve data-sentinela em
 * vez de nulo em parte dos resultados: medido em produção em 2026-08-11,
 * `0001-01-01` (3 ocorrências), `1858-11-17` (epoch do MJD) e `1900-01-01` (epoch
 * do Excel), em 5 de 264 candidatos.
 *
 * Preço sem data verdadeira não pode entrar na estimativa (IN 65/2021 exige fonte
 * + data + evidência), e o estrago é silencioso: o filtro de recência de 365 dias
 * descarta a linha sem dizer por quê, e a memória de cálculo sairia com uma data
 * falsa. Os limites são fixos de propósito — comparar com `Date.now()` acoplaria a
 * regra ao relógio e quebraria sob clock mockado.
 */
const DATA_REFERENCIA_MINIMA = new Date("2000-01-01T00:00:00Z");
const DATA_REFERENCIA_MAXIMA = new Date("2100-01-01T00:00:00Z");

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

/**
 * Prazo e orçamento de uma busca. Um por chamada de `buscarContratosPNCP`, passado
 * a todas as funções que fazem requisição — é o que torna o teto de tempo real em
 * vez de conselho (ver `TEMPO_MAX_BUSCA_MS`).
 */
interface ContextoBusca {
  /** Aborta as requisições em voo quando o prazo vence. */
  readonly sinal: AbortSignal;
  vencido(): boolean;
  restanteMs(): number;
  /**
   * Reserva `quantidade` consultas a `/resultados` do orçamento global. Tudo ou
   * nada: uma compra que não cabe inteira não gasta requisição nenhuma, já que
   * seria descartada no fim de qualquer forma.
   */
  reservarResultados(quantidade: number): boolean;
  /**
   * Contabiliza o desfecho de uma requisição de BUSCA TEXTUAL (as páginas de
   * edital e de ata). São só essas porque são elas que decidem se a busca
   * chegou a enxergar o universo: se todas falharem, um resultado vazio não diz
   * nada sobre o PNCP ter ou não contratações para o termo.
   */
  registrarBusca(sucesso: boolean): void;
  /** Quantas requisições de busca textual falharam depois de esgotar os retries. */
  buscasFalhas(): number;
  encerrar(): void;
}

/**
 * A coleta no PNCP falhou e o resultado vazio NÃO significa ausência de
 * contratações. Lançado só na combinação que não pode ser reportada como
 * resposta: nenhuma requisição de busca textual funcionou (ou as que
 * funcionaram não sobraram nenhum candidato) E houve falha de rede/HTTP.
 *
 * Existe porque `[]` é ambíguo e a ambiguidade chegava ao analista como
 * afirmação falsa. Medido em produção em 2026-08-27: 9 das 18 buscas de dois
 * dias voltaram vazias em 12,8s cravados — o teto de tempo consumido por
 * retries contra um `pncp.gov.br/api/search` que recusava conexão em rajada
 * (6 de 10 requisições resetadas em ~100ms na medição direta). O assistente
 * relatou "nenhum contrato encontrado no PNCP" nas duas situações, e o
 * analista não tinha como distinguir uma da outra. Ver CLAUDE.md §9.93.
 */
export class ErroColetaPNCP extends Error {
  constructor(
    readonly termo: string,
    readonly buscasFalhas: number,
    readonly prazoEsgotado: boolean,
  ) {
    super(
      `[PNCP] A consulta falhou para "${termo}": ${buscasFalhas} requisição(ões) de busca sem ` +
        `resposta${prazoEsgotado ? " e prazo da busca esgotado" : ""}. ` +
        "Resultado vazio aqui NÃO significa ausência de contratações.",
    );
    this.name = "ErroColetaPNCP";
  }
}

function criarContextoBusca(): ContextoBusca {
  const fimEm = Date.now() + TEMPO_MAX_BUSCA_MS;
  const controle = new AbortController();
  const timer = setTimeout(
    () => controle.abort(new Error("[PNCP] Prazo da busca esgotado.")),
    TEMPO_MAX_BUSCA_MS,
  );
  // Não segurar o processo (nem o teste) vivo por causa do prazo.
  timer.unref?.();
  // Cada requisição compõe este sinal com o timeout dela via `AbortSignal.any`, o
  // que registra um listener aqui. Sem isto, uma busca com dezenas de requisições
  // dispara MaxListenersExceededWarning no log de produção.
  setMaxListeners(0, controle.signal);

  let resultadosRestantes = MAX_RESULTADOS_POR_BUSCA;
  let falhasDeBusca = 0;

  return {
    sinal: controle.signal,
    vencido: () => controle.signal.aborted || Date.now() >= fimEm,
    restanteMs: () => fimEm - Date.now(),
    reservarResultados(quantidade) {
      if (quantidade > resultadosRestantes) return false;
      resultadosRestantes -= quantidade;
      return true;
    },
    registrarBusca(sucesso) {
      if (!sucesso) falhasDeBusca++;
    },
    buscasFalhas: () => falhasDeBusca,
    encerrar: () => clearTimeout(timer),
  };
}

async function fetchComRetry(url: string, ctx: ContextoBusca): Promise<Response> {
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      // Sinal novo a cada tentativa: um `AbortSignal.timeout` já disparado
      // aborta a requisição seguinte instantaneamente, anulando o retry. O prazo
      // da busca entra composto, para que vencer o prazo aborte o que está em voo.
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.any([AbortSignal.timeout(TIMEOUT_REQUISICAO_MS), ctx.sinal]),
      });
      const retryavel = res.status === 429 || res.status >= 500;
      if (res.ok || !retryavel || tentativa === MAX_TENTATIVAS) return res;
      console.warn(`[PNCP] HTTP ${res.status} (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${url}`);
    } catch (err) {
      ultimoErro = err;
      if (tentativa === MAX_TENTATIVAS) throw err;
      console.warn(`[PNCP] Falha de rede (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${url}`, err);
    }
    // Prazo vencido não se resolve com backoff: esperar aqui só atrasa o fim.
    if (ctx.vencido()) throw ultimoErro ?? new Error("[PNCP] Prazo esgotado durante o retry.");
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
  /**
   * O edital já tem julgamento publicado. Vem na resposta da busca textual, de
   * graça — ver `temJulgamento`, que é quem decide o que fazer com ele.
   *
   * Medido: no índice de ATAS este campo vem `null` em 100% dos casos, e por
   * isso o descarte por julgamento não se aplica a elas (ver `buscarPorTexto`).
   */
  tem_resultado?: boolean | null;
  /**
   * Só no índice de atas: o sequencial da COMPRA que originou a ata — diferente
   * de `numero_sequencial`, que ali é o sequencial da própria ata. É por ele que
   * se chega aos itens e ao preço homologado; `buscarPorTexto` normaliza o
   * `numero_sequencial` a partir daqui para que o resto do fluxo não precise
   * saber de qual índice o resultado veio.
   */
  numero_sequencial_compra_ata?: string;
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
 * Edital que pode render preço homologado — o único que vale gastar requisição.
 *
 * `tem_resultado` vem na resposta da busca textual que já é feita de qualquer
 * forma, então este filtro **não custa nenhuma requisição a mais** e devolve ao
 * orçamento de `/resultados` tudo que era gasto em edital ainda não julgado.
 * Medido contra a API real em 2026-08-26, em 4 termos e 160 editais: só 66% dos
 * editais lidos tinham julgamento. Numa amostra controlada, editais com o campo
 * verdadeiro renderam 6 preços em 10 requisições e os demais renderam **zero**
 * em 4 — é preditor exato, não heurística.
 *
 * **Por que `!== false` e não `=== true`.** Medido no mesmo dia: a API devolve o
 * campo sempre presente e explicitamente booleano (15 `false` e 5 `true` em 20
 * editais), nunca ausente. Ausência, portanto, só aconteceria se o contrato da
 * API mudasse — e aí incluir é o lado seguro do erro: `=== true` transformaria
 * uma mudança de contrato em busca que devolve zero candidatos em silêncio, que
 * é o modo de falha mais caro que existe aqui. Mesma escolha, pela mesma razão,
 * que `temResultado` no nível do item (ver `buscarItensDaCompra`).
 */
function temJulgamento(item: PNCPSearchItem): boolean {
  return item.tem_resultado !== false;
}

/**
 * Identidade da COMPRA por trás de um resultado da busca textual — a chave de
 * deduplicação correta.
 *
 * **`numero_controle_pncp` NÃO serve para isso**, e usá-lo foi o primeiro
 * desenho: o edital vem como `25107525000151-1-000047/2024` e a ata da mesma
 * compra como `00394452000103-1-018722/2024-000001`, com um sufixo de sequencial
 * da própria ata. Medido em 2026-08-26 num termo real: deduplicar por
 * `numero_controle_pncp` detectou **0** sobreposições entre editais e atas,
 * enquanto a identidade da compra detectou 2 — ou seja, a mesma compra seria
 * lida duas vezes, gastando orçamento em dobro e gerando candidato duplicado
 * para o mesmo item.
 *
 * Também colapsa corretamente várias atas da mesma compra (uma compra com N
 * fornecedores registrados publica N atas, todas apontando para a mesma
 * `numero_sequencial_compra_ata`).
 */
function chaveCompra(item: PNCPSearchItem): string {
  return `${item.orgao_cnpj}/${item.ano}/${item.numero_sequencial}`;
}

/** As 27 unidades federativas, no formato que o parâmetro `ufs` aceita. */
export const UFS_VALIDAS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

/** Esferas administrativas aceitas pelo parâmetro `esferas`. */
export const ESFERAS_VALIDAS = ["F", "E", "M"] as const;

/** Situações aceitas pelo parâmetro `status`. */
export const STATUS_VALIDOS = ["encerradas", "recebendo_proposta", "em_julgamento"] as const;

/**
 * Recorte opcional da busca textual, pedido pelo analista.
 *
 * **Todo valor aqui já tem de estar validado pelo chamador.** A API do PNCP
 * falha de duas formas silenciosas e incompatíveis entre si, medidas em
 * 2026-08-26 contra o endpoint real:
 *
 * - `ufs=XX` (UF inexistente) e `ufs=sp` (minúsculo) devolvem **0 resultados**,
 *   não erro. Um valor errado vira "nenhuma contratação pública encontrada" —
 *   e o analista concluiria que o objeto não tem referência no PNCP quando o
 *   que houve foi um filtro malformado.
 * - `status=lixo` é **silenciosamente ignorado** (devolve o total sem filtro),
 *   ou seja o oposto: o analista pensa que recortou e não recortou nada.
 *
 * Nenhuma das duas é detectável a posteriori pela resposta. Por isso a validação
 * é feita na fronteira, com Zod, antes de chegar aqui (ver `lib/assistente`), e
 * os valores aceitos vivem nas constantes acima.
 *
 * **Multivalor não existe**: `ufs=SP,RJ` devolve 0, e não a união. Um filtro por
 * vez.
 */
export interface FiltrosBuscaPNCP {
  /** Sigla da UF em maiúsculas. Ver `UFS_VALIDAS`. */
  uf?: string;
  /** `F` federal, `E` estadual, `M` municipal. Ver `ESFERAS_VALIDAS`. */
  esfera?: string;
  /** Situação da contratação. Ver `STATUS_VALIDOS`. */
  status?: string;
}

/** Converte os filtros em parâmetros de query, omitindo os não informados. */
function paramsDosFiltros(filtros: FiltrosBuscaPNCP | undefined): Record<string, string> {
  if (!filtros) return {};
  return {
    ...(filtros.uf ? { ufs: filtros.uf } : {}),
    ...(filtros.esfera ? { esferas: filtros.esfera } : {}),
    ...(filtros.status ? { status: filtros.status } : {}),
  };
}

/**
 * Busca textual real do PNCP (mesmo endpoint usado pelo site oficial em
 * pncp.gov.br/busca). A API de Consulta (/api/consulta) não suporta texto
 * livre — esse endpoint é o que permite encontrar processos relevantes ao
 * termo do item, em vez de uma amostra aleatória de publicações recentes.
 *
 * Chamada em paralelo para todas as páginas de cada tipo de documento em
 * `buscarContratosPNCP`; expõe `pagina` e `tipo` para que os testes possam
 * asserir o que é pedido.
 *
 * **Sobre `tipo: "ata"`.** A ata é indexada à parte, mas os itens e o preço
 * homologado vivem na compra-mãe — por isso o retorno é normalizado para a
 * identidade da COMPRA (`numero_sequencial_compra_ata`), e daí para frente o
 * fluxo é idêntico ao do edital. Ver `PAGINAS_BUSCA_ATA`.
 */
async function buscarPorTexto(
  termo: string,
  ctx: ContextoBusca,
  pagina = 1,
  tipo: "edital" | "ata" = "edital",
  filtros?: FiltrosBuscaPNCP,
): Promise<PNCPSearchItem[]> {
  const params = new URLSearchParams({
    q: termo,
    tipos_documento: tipo,
    // Relevância, não data: a recência já é garantida depois pelo filtroRecencia
    // (corte de 365 dias); ordenar por data aqui só traz os editais mais recentes
    // que casam vagamente com o termo, sacrificando os realmente relevantes.
    ordenacao: "relevancia",
    pagina: String(pagina),
    tam_pagina: String(TAMANHO_PAGINA),
    // Medido: os mesmos filtros valem para os DOIS índices — no de atas,
    // `ufs=SP` levou 19 atas para 2 e `esferas=M` para 8. É o que faz o recorte
    // do analista alcançar também as compras que só a ata encontra (P3).
    ...paramsDosFiltros(filtros),
  });

  const url = `${PNCP_SEARCH_BASE_URL}/?${params.toString()}`;

  // A falha é contida AQUI, e não propagada ao `Promise.all` do chamador. Antes,
  // uma única página que esgotasse os retries rejeitava o `Promise.all` inteiro
  // e o catch externo devolvia `[]` — as outras cinco requisições, já pagas e
  // bem-sucedidas, iam junto. Com o PNCP recusando conexão em rajada (medido:
  // 6 de 10 requisições resetadas), basta uma azarada para zerar a busca.
  // Isolando, a busca degrada em cobertura em vez de virar tudo ou nada, e a
  // contagem de falhas é o que permite ao chamador distinguir vazio de calado.
  let res: Response;
  try {
    res = await fetchComRetry(url, ctx);
  } catch (err) {
    ctx.registrarBusca(false);
    console.error(`[PNCP] Busca textual ${tipo} p.${pagina} ("${termo}") sem resposta:`, err);
    return [];
  }

  if (!res.ok) {
    ctx.registrarBusca(false);
    console.error(`[PNCP] Falha na busca textual ${tipo} ("${termo}"): HTTP ${res.status}`);
    return [];
  }
  ctx.registrarBusca(true);

  const body = (await res.json()) as { items?: PNCPSearchItem[] };
  const brutos = body.items ?? [];

  // A ata aponta para a compra-mãe por um campo próprio; sem esta normalização,
  // `numero_sequencial` seria o sequencial da ATA e todos os caminhos de
  // `/orgaos/{cnpj}/compras/{ano}/{seq}/...` cairiam em outra compra ou em 404 —
  // exatamente a armadilha medida nos contratos (CLAUDE.md §9.96). Medido em 59
  // atas: `numero_sequencial_compra_ata` estava presente em todas.
  const itens =
    tipo === "ata"
      ? brutos.flatMap((item) =>
          item.numero_sequencial_compra_ata
            ? [{ ...item, numero_sequencial: item.numero_sequencial_compra_ata }]
            : [],
        )
      : brutos;

  // Exclusão do próprio órgão e descarte de edital sem julgamento aplicados aqui
  // (e não no chamador) para que qualquer consumidor futuro da busca textual
  // herde as duas regras automaticamente.
  //
  // O descarte por julgamento vale SÓ para edital. Medido em 59 atas: o índice
  // de atas devolve `tem_resultado: null` em 100% delas — o campo simplesmente
  // não é preenchido para esse tipo de documento. Hoje `temJulgamento` deixaria
  // todas passar por acidente (`null !== false`), e depender disso seria frágil:
  // bastaria o PNCP passar a mandar `false` ali para as atas sumirem inteiras,
  // em silêncio. A condição explícita também diz a coisa certa sobre o domínio —
  // uma ata de registro de preços só existe DEPOIS da homologação, então "não
  // tem julgamento" não é um estado possível para ela.
  const proprio = cnpjOrgaoProprio();
  return itens.filter(
    (item) =>
      normalizarCnpj(item.orgao_cnpj) !== proprio &&
      (tipo === "ata" || temJulgamento(item)),
  );
}

/**
 * Percorre todas as páginas de `/itens`. Ver ITENS_TAMANHO_PAGINA.
 *
 * `completo: false` significa que o prazo venceu no meio da paginação — o
 * chamador precisa saber disso para descartar a compra inteira, em vez de tratar
 * meia coleção de itens como se fosse a compra toda.
 */
async function buscarTodosItens(
  processo: PNCPSearchItem,
  ctx: ContextoBusca,
): Promise<{ itens: PNCPItemResponse[]; completo: boolean }> {
  const base = `${PNCP_ITENS_BASE_URL}/orgaos/${processo.orgao_cnpj}/compras/${processo.ano}/${processo.numero_sequencial}/itens`;
  const todos: PNCPItemResponse[] = [];

  for (let pagina = 1; pagina <= ITENS_MAX_PAGINAS; pagina++) {
    if (ctx.vencido()) return { itens: todos, completo: false };

    const res = await fetchComRetry(
      `${base}?pagina=${pagina}&tamanhoPagina=${ITENS_TAMANHO_PAGINA}`,
      ctx,
    );
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

  return { itens: todos, completo: true };
}

/**
 * Tokens que aparecem em quase toda descrição de item público e por isso não
 * distinguem nada. Ficam de fora do casamento porque **um token genérico sozinho
 * é suficiente para o item entrar**: em "lavagem fachada predio novo pastilhas
 * pele de vidro", `novo` respondeu por 125 dos matches e trouxe argamassa e
 * abraçadeira de nylon como candidatos a referência de preço (CLAUDE.md §9.64).
 *
 * A lista é curta e conservadora de propósito — cortar demais derruba recall, e
 * recall perdido aqui é silencioso. Só entram duas famílias:
 *
 * 1. **Meta-vocabulário do ato administrativo** (`aquisicao`, `contratacao`,
 *    `servico`, ...): nomeia a compra, nunca o produto.
 * 2. **Chaves de atributo do CATMAT** (`material`, `tipo`, `cor`, ...): itens com
 *    código de catálogo vêm como pares `chave: valor` — medido contra a API real
 *    em 2026-08-11, 265 a 472 caracteres por descrição. O sinal está no valor
 *    (`aço`, `giratória`), nunca na chave, que se repete em categorias
 *    inteiramente diferentes.
 *
 * Palavra que nomeie produto ou serviço não entra aqui, mesmo parecendo genérica
 * (`limpeza`, `conjunto`, `kit`): é ela que sustenta buscas como "material de
 * limpeza", onde `material` sai e `limpeza` carrega o significado.
 */
const TOKENS_SEM_PODER_DISCRIMINANTE: ReadonlySet<string> = new Set(
  [
    // Meta-vocabulário do ato administrativo.
    "aquisicao", "contratacao", "fornecimento", "prestacao", "servico", "objeto",
    "item", "lote", "produto", "empresa", "eventual", "futura", "demanda",
    // Chaves de atributo do CATMAT e sucata de descrição.
    "material", "tipo", "modelo", "marca", "cor", "caracteristica", "adicional",
    "aplicacao", "referencia", "medida", "unidade", "descricao", "especificacao",
    "componente", "acessorio", "formato", "apresentacao",
    // Adjetivos de estado, que valem para qualquer coisa.
    "novo", "usado", "comum", "geral", "diverso", "outro", "demais", "similar",
  ].map(raizPlural),
);

/**
 * Ordena os itens da compra pela relevância ao termo e descarta os que não casam
 * em nada. Uma compra pode ter centenas de itens e cada um custa uma requisição a
 * mais para obter o valor homologado; o chamador consulta só os
 * `MAX_ITENS_RELEVANTES_POR_COMPRA` primeiros, então **a ordem aqui decide em que
 * itens o orçamento é gasto** — antes vinham os 10 primeiros na ordem da API, que
 * é a ordem do edital e não tem relação com a busca.
 *
 * O peso de cada token casado é o IDF dentro da própria compra: token presente em
 * todos os itens não separa nada (numa ata só de cadeiras, `cadeira` é ruído e
 * `giratoria` é o sinal), token raro separa muito. Isso ranqueia; quem *exclui* o
 * ruído entre categorias diferentes é a `TOKENS_SEM_PODER_DISCRIMINANTE`, porque
 * IDF calculado dentro de uma compra não enxerga o que é genérico fora dela.
 *
 * Termo sem token utilizável não filtra nada — errar para o lado de consultar
 * demais é preferível a devolver zero candidatos.
 */
function ranquearPorRelevancia(termo: string, itens: PNCPItemResponse[]): PNCPItemResponse[] {
  const tokensTermo = new Set(
    tokenizar(termo)
      .map(raizPlural)
      .filter((token) => !TOKENS_SEM_PODER_DISCRIMINANTE.has(token)),
  );
  if (tokensTermo.size === 0) return itens;

  const tokensPorItem = itens.map(
    (item) => new Set(tokenizar(limparDescricao(item.descricao)).map(raizPlural)),
  );

  // Frequência de documento de cada token do termo, medida nos itens desta compra.
  const frequencia = new Map<string, number>();
  for (const token of tokensTermo) {
    frequencia.set(token, tokensPorItem.reduce((n, tokens) => n + (tokens.has(token) ? 1 : 0), 0));
  }

  const total = itens.length;
  const pontuar = (tokens: Set<string>): number => {
    let pontos = 0;
    for (const token of tokensTermo) {
      if (!tokens.has(token)) continue;
      // +1 no denominador evita divisão por zero; +1 dentro do log mantém o peso
      // positivo mesmo para token presente em todos os itens.
      pontos += Math.log(1 + total / (1 + (frequencia.get(token) ?? 0)));
    }
    return pontos;
  };

  return itens
    .map((item, indice) => ({ item, pontos: pontuar(tokensPorItem[indice]!) }))
    .filter((entrada) => entrada.pontos > 0)
    // Empate preserva a ordem do edital sem desempate explícito: `sort` é estável
    // por especificação desde a ES2019. Havia aqui um `|| a.indice - b.indice`
    // com um comentário dizendo que a determinística dependia dele — a mutação
    // mostrou que nenhum teste o distinguia, e ele saiu (CLAUDE.md §9.35).
    .sort((a, b) => b.pontos - a.pontos)
    .map((entrada) => entrada.item);
}

/**
 * Converte a data crua do PNCP, devolvendo `null` quando ela não é utilizável como
 * referência de preço — inválida, ausente ou fora da janela plausível. Ver
 * DATA_REFERENCIA_MINIMA para as sentinelas que motivaram a checagem.
 */
function dataPlausivel(bruta: string | null | undefined): Date | null {
  if (!bruta) return null;
  const data = new Date(bruta);
  if (Number.isNaN(data.getTime())) return null;
  if (data < DATA_REFERENCIA_MINIMA || data >= DATA_REFERENCIA_MAXIMA) return null;
  return data;
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
  ctx: ContextoBusca,
): Promise<PNCPResultadoItem | null> {
  const url = `${PNCP_ITENS_BASE_URL}/orgaos/${processo.orgao_cnpj}/compras/${processo.ano}/${processo.numero_sequencial}/itens/${numeroItem}/resultados`;

  const res = await fetchComRetry(url, ctx);
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
  ctx: ContextoBusca,
): Promise<CandidatoSimilaridade[]> {
  try {
    const { itens: todos, completo } = await buscarTodosItens(processo, ctx);
    // Compra com a lista de itens truncada pelo prazo é descartada inteira: os
    // candidatos que sobrariam viriam de um recorte arbitrário da compra.
    if (!completo) return [];

    // `temResultado === false` dispensa a chamada extra; ausente (contrato antigo da
    // API) é tratado como "pode ter" para não descartar item válido por omissão.
    // O `slice` corta pela ordem de `ranquearPorRelevancia`, que é decrescente em
    // relevância — quem sobra são os mais aderentes ao termo, não os primeiros do edital.
    const candidatos = ranquearPorRelevancia(termo, todos)
      .filter((item) => item.temResultado !== false)
      .slice(0, MAX_ITENS_RELEVANTES_POR_COMPRA);

    // Reserva antes de gastar: sem orçamento para a compra inteira ela seria
    // descartada no fim, então não vale pagar nenhuma requisição por ela.
    if (candidatos.length > 0 && !ctx.reservarResultados(candidatos.length)) {
      console.warn(
        `[PNCP] Orçamento de resultados esgotado; ${processo.numero_controle_pncp} não foi consultado.`,
      );
      return [];
    }

    const resultados = await processarComConcorrencia(
      candidatos,
      LOTE_BUSCA_RESULTADOS,
      (item) => buscarResultadoDoItem(processo, item.numeroItem, ctx),
      (item, erro) =>
        console.warn(
          `[PNCP] Erro no resultado do item ${item.numeroItem} de ${processo.numero_controle_pncp}:`,
          erro,
        ),
    );

    // Prazo vencido durante as consultas de resultado: mesma regra do truncamento
    // acima — a compra sai inteira, não pela metade.
    if (ctx.vencido()) return [];

    const encontrados: CandidatoSimilaridade[] = [];
    candidatos.forEach((item, indice) => {
      const resultado = resultados[indice];
      // Item sem valor homologado fica de fora: só entra na série o preço
      // efetivamente contratado. Decisão do usuário em 2026-07-30 — o estimado é
      // anterior ao certame e distorce a estimativa (IN 65/2021).
      if (!resultado?.valorUnitarioHomologado) return;

      // `dataResultado` é a data do julgamento — referência correta do preço.
      // `dataAtualizacao` do item muda por edição cadastral e vale só como recurso.
      // Sem data plausível o candidato não entra: preço sem data não sustenta a
      // estimativa (IN 65/2021). Ver DATA_REFERENCIA_MINIMA.
      const dataReferencia =
        dataPlausivel(resultado.dataResultado) ?? dataPlausivel(item.dataAtualizacao);
      if (!dataReferencia) {
        console.warn(
          `[PNCP] Item ${item.numeroItem} de ${processo.numero_controle_pncp} descartado: ` +
            `data de referência implausível (resultado=${resultado.dataResultado ?? "ausente"}, ` +
            `atualização=${item.dataAtualizacao ?? "ausente"}).`,
        );
        return;
      }

      encontrados.push({
        tipoCandidato: "contratacao_publica",
        fonteDescricao: limparDescricao(item.descricao),
        fonteOrgaoOuId: processo.orgao_nome,
        fonteUrl: montarUrlEdital(processo),
        valorUnitario: resultado.valorUnitarioHomologado,
        dataReferencia,
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
 * Aplica a faixa de valor sobre os candidatos já buscados. Nenhuma das fontes
 * públicas (PNCP, Painel de Preços, Compras.gov/catálogo, SINAPI) tem
 * parâmetro de faixa de valor nativo — o filtro só existe no lado da
 * aplicação, depois que o preço homologado já foi resolvido. Reusado por
 * `lib/assistente/ferramentas.ts` sobre o resultado já mesclado de
 * `buscarCandidatosPublicos`, não só sobre o PNCP puro. Como
 * `buscarItensDaCompra` já descarta todo item sem homologado, `valorUnitario`
 * aqui é sempre o preço efetivamente contratado, nunca o estimado.
 */
export function filtrarPorValor(
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
 * Cobre dois índices do PNCP: **editais** e **atas de registro de preços**. A
 * ata é o único caminho para uma parte das compras — metade das atas devolvidas
 * aponta para compra que a busca por edital não alcança (medido em 2026-08-26).
 * Uma vez resolvida a compra-mãe, o tratamento é idêntico para as duas origens.
 *
 * Devolve **apenas preços homologados**: o valor estimado do edital é o orçamento
 * feito antes do certame e não serve como referência de preço praticado.
 */
export async function buscarContratosPNCP(
  termo: string,
  filtroValor?: FiltroValorPNCP,
  filtros?: FiltrosBuscaPNCP,
): Promise<CandidatoSimilaridade[]> {
  if (!termo.trim()) return [];

  const ctx = criarContextoBusca();
  try {
    // Editais e atas, todas as páginas em paralelo — ver PAGINAS_BUSCA_TEXTUAL e
    // PAGINAS_BUSCA_ATA. Não custa tempo de parede (o gargalo é latência), e cada
    // página já chega sem o próprio órgão e, no caso dos editais, sem os que não
    // têm julgamento (`buscarPorTexto`).
    const [paginasEdital, paginasAta] = await Promise.all([
      Promise.all(
        Array.from({ length: PAGINAS_BUSCA_TEXTUAL }, (_, i) =>
          buscarPorTexto(termo, ctx, i + 1, "edital", filtros),
        ),
      ),
      Promise.all(
        Array.from({ length: PAGINAS_BUSCA_ATA }, (_, i) =>
          buscarPorTexto(termo, ctx, i + 1, "ata", filtros),
        ),
      ),
    ]);

    // **Intercalar, não concatenar.** O orçamento (`MAX_RESULTADOS_POR_BUSCA`) já
    // é a restrição que morde: as 4 páginas de edital sozinhas entregam ~58
    // compras processáveis para um teto de ~37. Concatenar as atas no fim seria
    // acrescentá-las a uma fila que nunca chega ao fim — elas custariam 2
    // requisições de busca e não seriam lidas nunca, que é o modo de falha da
    // §9.40 (a feature existe e não faz nada). Concatenar na frente teria o
    // problema simétrico, expulsando editais.
    //
    // A intercalação divide o orçamento entre as duas origens sem precisar
    // afirmar qual rende mais — o que seria palpite: as duas medições de
    // rendimento que tenho foram feitas com tetos de itens diferentes e não são
    // comparáveis entre si (§9.69).
    const vistos = new Set<string>();
    const processos: PNCPSearchItem[] = [];
    const filaEdital = paginasEdital.flat();
    const filaAta = paginasAta.flat();
    for (let i = 0; i < Math.max(filaEdital.length, filaAta.length); i++) {
      for (const item of [filaEdital[i], filaAta[i]]) {
        // Deduplicação pela identidade da COMPRA, não por `numero_controle_pncp`:
        // é o que faz a ata e o edital da mesma compra colidirem (ver
        // `chaveCompra` — medido, a chave antiga detectava 0 sobreposições).
        if (!item) continue;
        const chave = chaveCompra(item);
        if (!vistos.has(chave)) {
          vistos.add(chave);
          processos.push(item);
        }
      }
    }
    const itensPorProcesso: CandidatoSimilaridade[][] = [];
    for (let i = 0; i < processos.length; i += LOTE_BUSCA_ITENS) {
      // Reserva, não só "ainda não venceu": um lote iniciado a 200ms do fim é
      // descartado inteiro depois, então começá-lo é requisição paga por nada.
      if (ctx.restanteMs() < RESERVA_LOTE_MS) {
        console.warn(
          `[PNCP] Teto de tempo atingido em "${termo}": ${i} de ${processos.length} editais lidos.`,
        );
        break;
      }
      const lote = processos.slice(i, i + LOTE_BUSCA_ITENS);
      itensPorProcesso.push(
        ...(await Promise.all(lote.map((processo) => buscarItensDaCompra(processo, termo, ctx)))),
      );
    }
    const candidatos = filtrarPorValor(itensPorProcesso.flat(), filtroValor);

    // O único estado que não pode ser devolvido como resposta: nada colhido E a
    // coleta tropeçou. Enumerar os desfechos em vez de colapsá-los é o que a
    // §9.93 pede — "isto é uma falha ou uma resposta?" — e aqui há três:
    //   candidatos > 0                → resposta (mesmo com falha parcial: o
    //                                   analista prefere o que veio, e a
    //                                   cobertura menor já é sinalizada em log);
    //   candidatos = 0, sem falha     → resposta legítima ("o PNCP não tem");
    //   candidatos = 0, com falha     → não sabemos, e dizer "não tem" é mentir.
    if (candidatos.length === 0 && ctx.buscasFalhas() > 0) {
      throw new ErroColetaPNCP(termo, ctx.buscasFalhas(), ctx.vencido());
    }
    return candidatos;
  } catch (err) {
    if (err instanceof ErroColetaPNCP) throw err;
    console.error(`[PNCP] Erro inesperado ao buscar contratações para "${termo}":`, err);
    return [];
  } finally {
    ctx.encerrar();
  }
}

/**
 * Teto de itens consultados ao listar TODOS os itens de uma contratação já
 * identificada (picker de "outros itens desta licitação" no card do
 * assistente — diferente de `buscarContratosPNCP`, que descobre contratações a
 * partir de um termo). Uma ata de registro de preços pode ter centenas de
 * itens, e cada um custa uma requisição extra a `/resultados`.
 */
const MAX_ITENS_LISTAGEM_COMPRA = 30;

/**
 * Lista os itens homologados de UMA contratação específica já identificada
 * (cnpj/ano/sequencial do edital), para oferecer ao analista os itens que a
 * busca por relevância não trouxe como candidato principal — o ranqueamento em
 * `buscarItensDaCompra` mantém só os `MAX_ITENS_RELEVANTES_POR_COMPRA` mais
 * aderentes ao termo, descartando o resto em silêncio.
 *
 * `orgaoNome` vem do candidato original (mesma contratação, mesmo órgão) —
 * este endpoint do PNCP não devolve o nome do órgão, só o CNPJ.
 *
 * Mesma regra de preço das demais buscas: só item com `valorUnitarioHomologado`
 * e data plausível entra na lista (IN 65/2021 — nunca o valor estimado).
 */
export async function listarItensDaCompraPNCP(
  identidade: Pick<IdentidadeContratacao, "cnpjOrgao" | "ano" | "numeroSequencial">,
  orgaoNome: string,
): Promise<{ candidatos: CandidatoSimilaridade[]; completo: boolean }> {
  const processo: PNCPSearchItem = {
    numero_controle_pncp: `${identidade.cnpjOrgao}/${identidade.ano}/${identidade.numeroSequencial}`,
    orgao_nome: orgaoNome,
    orgao_cnpj: identidade.cnpjOrgao,
    ano: identidade.ano,
    numero_sequencial: identidade.numeroSequencial,
  };

  const ctx = criarContextoBusca();
  try {
    const { itens: todos, completo: paginacaoCompleta } = await buscarTodosItens(processo, ctx);
    if (!paginacaoCompleta) return { candidatos: [], completo: false };

    const consultaveis = todos.filter((item) => item.temResultado !== false);
    const selecionados = consultaveis.slice(0, MAX_ITENS_LISTAGEM_COMPRA);
    const completo = selecionados.length === consultaveis.length;

    const resultados = await processarComConcorrencia(
      selecionados,
      LOTE_BUSCA_RESULTADOS,
      (item) => buscarResultadoDoItem(processo, item.numeroItem, ctx),
      (item, erro) =>
        console.warn(
          `[PNCP] Erro no resultado do item ${item.numeroItem} de ${processo.numero_controle_pncp}:`,
          erro,
        ),
    );

    // Prazo vencido durante as consultas: mesma regra das demais buscas deste
    // arquivo — a lista sai vazia (o chamador trata como "tente de novo"), não
    // pela metade.
    if (ctx.vencido()) return { candidatos: [], completo: false };

    const candidatos: CandidatoSimilaridade[] = [];
    selecionados.forEach((item, indice) => {
      const resultado = resultados[indice];
      if (!resultado?.valorUnitarioHomologado) return;

      const dataReferencia =
        dataPlausivel(resultado.dataResultado) ?? dataPlausivel(item.dataAtualizacao);
      if (!dataReferencia) return;

      candidatos.push({
        tipoCandidato: "contratacao_publica",
        fonteDescricao: limparDescricao(item.descricao),
        fonteOrgaoOuId: orgaoNome,
        fonteUrl: montarUrlEdital(processo),
        valorUnitario: resultado.valorUnitarioHomologado,
        dataReferencia,
        unidade: item.unidadeMedida,
        quantidade: resultado.quantidadeHomologada ?? item.quantidade,
        identidadeContratacao: {
          cnpjOrgao: identidade.cnpjOrgao,
          ano: identidade.ano,
          numeroSequencial: identidade.numeroSequencial,
          numeroItem: item.numeroItem,
        },
      });
    });

    return { candidatos, completo };
  } catch (err) {
    console.error(
      `[PNCP] Erro ao listar itens da contratação ${processo.numero_controle_pncp}:`,
      err,
    );
    return { candidatos: [], completo: false };
  } finally {
    ctx.encerrar();
  }
}
