// Sem `import "server-only"` deliberadamente (CLAUDE.md §9.62): o script administrativo que roda
// este enriquecimento precisa importá-lo fora do bundler do Next, onde `server-only` sempre lança.
// Não é alcançável a partir de `components/` — só pelo script administrativo.
import { readFile, rename, writeFile } from "node:fs/promises";
import { dbCandidatos as db } from "@/lib/dbCandidatos";

/**
 * Cruzamento dos candidatos a Fornecedor (M27, base da Receita Federal) com o SICAF — o cadastro
 * de empresas efetivamente habilitadas a licitar com o governo federal (compras.gov.br). A Receita
 * Federal traz TODA empresa que existe; o SICAF é o subconjunto que já participa de licitação, e é
 * essa distinção que o usuário pediu para registrar como prioridade na busca de candidatos.
 *
 * Fonte: `modulo-fornecedor/1_consultarFornecedor` (dadosabertos.compras.gov.br), sem autenticação.
 * Medido em 2026-08-28: 826.570 fornecedores com `ativo=true`.
 *
 * **Busca particionada por CNAE, não paginação linear do dataset inteiro.** Uma primeira versão
 * paginava `ativo=true` direto, página 1 a ~1.654 — e foi abandonada por medição: a latência da API
 * CRESCE com a profundidade da página (típico de paginação por `OFFSET`), não é constante. Medido
 * direto: página 1 = 5,4s, página 800 = 11,9s, página 1600 = 35,3s. Com esse perfil, uma rodagem real
 * ficou **35 minutos rodando sem terminar** antes de ser abortada. A correção é nunca deixar uma
 * única consulta chegar a uma página profunda: filtrar por `codigoCnae` divide o total em ~1.300
 * fatias pequenas (medido: um CNAE comum, "instalação elétrica", tem 12.879 registros = 26 páginas —
 * a mais funda ainda está na faixa rápida). A lista de CNAEs vem da própria base de candidatos
 * (`GROUP BY cnaePrincipalCodigo`, ~7s contra 14M linhas, aceitável em script one-shot) — como os 4
 * estados importados cobrem praticamente todo o catálogo de CNAE do Brasil, um fornecedor do SICAF
 * cujo CNAE não apareça nessa lista não teria candidato correspondente em `EmpresaCandidataFornecedor`
 * de qualquer forma (nenhum CNPJ nosso usa esse CNAE), então a lacuna é irrelevante na prática.
 *
 * Timeout explícito por requisição (`AbortSignal.timeout`): sem ele, uma página que trave não
 * derruba o processo, só o deixa preso indefinidamente — o mesmo modo de silêncio que já custou os
 * 35 minutos acima.
 *
 * Todo-ou-nada na leitura: se qualquer CNAE falhar após as tentativas de retry, a função lança sem
 * escrever nada (mesmo princípio do CLAUDE.md §9.65 — resultado parcial de uma coleta cara não vira
 * gravação parcial, porque marcaria "não habilitado" empresa que só não foi lida a tempo).
 *
 * Escrita em duas fases, cada uma em lote (nunca 1 UPDATE por CNPJ — CLAUDE.md §9.72):
 * 1. Desmarca quem estava `sicafHabilitado = true` e não apareceu nesta rodada (saiu do SICAF).
 * 2. Marca/atualiza quem apareceu — sempre roda no CNPJ inteiro, mesmo já marcado, porque
 *    `sicafAtualizadoEm` precisa refletir "confirmado nesta rodada", não só "confirmado alguma vez".
 *
 * A base do SICAF traz fornecedor pessoa física (campo `cpf`, sem `cnpj`) — `EmpresaCandidataFornecedor`
 * é só CNPJ, então esses registros são ignorados (não há como casar).
 */

const BASE_URL = "https://dadosabertos.compras.gov.br/modulo-fornecedor/1_consultarFornecedor";
const TAMANHO_PAGINA = 500;
const CONCORRENCIA_PADRAO = 4;
/** Erro genérico (500, rede): poucas tentativas — falha persistente não melhora insistindo. */
const MAX_TENTATIVAS = 3;
/** Rate limit é diferente: passa sozinho com o tempo, então vale esperar bem mais vezes. */
const MAX_TENTATIVAS_RATE_LIMIT = 8;
const BACKOFF_BASE_MS = 800;
/** Backoff próprio para HTTP 429: rate limit não passa em 800ms, e insistir cedo só renova o
 * bloqueio. Medido em 2026-08-28: a rodagem com concorrência 8 tomou 429 após ~340s de coleta. */
const BACKOFF_RATE_LIMIT_MS = 20_000;
const TIMEOUT_REQUISICAO_MS = 40_000;
const TAMANHO_LOTE_UPDATE = 20_000;

/**
 * Pausa COMPARTILHADA entre todos os workers. Sem isso, um worker que toma 429 espera sozinho
 * enquanto os outros seguem martelando a API e renovam o bloqueio para todo mundo — o rate limit é
 * do servidor, não da conexão, então a reação a ele também precisa ser global.
 */
const rateLimit = { pausadoAte: 0 };

async function respeitarPausaGlobal(): Promise<void> {
  const restante = rateLimit.pausadoAte - Date.now();
  if (restante > 0) await esperar(restante);
}

function registrarRateLimit(esperaMs: number): void {
  rateLimit.pausadoAte = Math.max(rateLimit.pausadoAte, Date.now() + esperaMs);
}

interface FornecedorSicaf {
  cnpj: string | null;
  cpf: string | null;
  ativo: boolean;
  habilitadoLicitar: boolean;
}

interface RespostaPaginadaSicaf {
  resultado: FornecedorSicaf[];
  totalRegistros: number;
  totalPaginas: number;
}

export interface ProgressoEnriquecimentoSicaf {
  cnaesProcessados: number;
  cnaesTotal: number;
  cnpjsEncontrados: number;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `Retry-After` pode vir em segundos ou como data HTTP; ausente/inválido cai no backoff próprio. */
function esperaDoRetryAfter(res: Response, tentativa: number): number {
  const cru = res.headers?.get?.("retry-after");
  if (cru) {
    const segundos = Number(cru);
    if (Number.isFinite(segundos) && segundos > 0) return segundos * 1000;
    const data = Date.parse(cru);
    if (!Number.isNaN(data)) {
      const delta = data - Date.now();
      if (delta > 0) return delta;
    }
  }
  return BACKOFF_RATE_LIMIT_MS * tentativa;
}

async function buscarPaginaSicaf(codigoCnae: string, pagina: number): Promise<RespostaPaginadaSicaf> {
  const url =
    `${BASE_URL}?ativo=true&codigoCnae=${encodeURIComponent(codigoCnae)}` +
    `&pagina=${pagina}&tamanhoPagina=${TAMANHO_PAGINA}`;
  let ultimoErro: unknown;
  // Contadas em separado: um 429 não consome a cota de tentativas de erro genérico (e vice-versa),
  // porque as duas falhas têm perfis opostos — rate limit passa esperando, HTTP 500 não.
  let tentativasGenericas = 0;
  let tentativasRateLimit = 0;

  while (
    tentativasGenericas < MAX_TENTATIVAS &&
    tentativasRateLimit < MAX_TENTATIVAS_RATE_LIMIT
  ) {
    await respeitarPausaGlobal();
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_REQUISICAO_MS),
      });
      if (res.ok) return (await res.json()) as RespostaPaginadaSicaf;

      // 429 é o caso que precisa de tratamento próprio: espera longa E global (ver `rateLimit`).
      if (res.status === 429) {
        tentativasRateLimit++;
        ultimoErro = new Error(
          `HTTP 429 (rate limit) ao buscar CNAE ${codigoCnae} página ${pagina} do SICAF`,
        );
        if (tentativasRateLimit < MAX_TENTATIVAS_RATE_LIMIT) {
          const espera = esperaDoRetryAfter(res, tentativasRateLimit);
          registrarRateLimit(espera);
          await esperar(espera);
        }
        continue;
      }

      ultimoErro = new Error(`HTTP ${res.status} ao buscar CNAE ${codigoCnae} página ${pagina} do SICAF`);
    } catch (err) {
      ultimoErro = err;
    }
    tentativasGenericas++;
    if (tentativasGenericas < MAX_TENTATIVAS) {
      await esperar(BACKOFF_BASE_MS * 2 ** (tentativasGenericas - 1));
    }
  }

  throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro));
}

/** Todas as páginas de UM CNAE — sequencial (poucas páginas por CNAE, medido: até ~26 para os mais
 * comuns), a concorrência real vem de processar vários CNAEs ao mesmo tempo. */
async function buscarTodoOCnae(codigoCnae: string, cnpjs: Set<string>): Promise<void> {
  const primeira = await buscarPaginaSicaf(codigoCnae, 1);
  const registrar = (pagina: RespostaPaginadaSicaf) => {
    for (const item of pagina.resultado) {
      const cnpj = item.cnpj?.trim();
      if (cnpj && item.habilitadoLicitar) cnpjs.add(cnpj);
    }
  };
  registrar(primeira);

  for (let pagina = 2; pagina <= primeira.totalPaginas; pagina++) {
    registrar(await buscarPaginaSicaf(codigoCnae, pagina));
  }
}

async function processarComConcorrenciaOuFalhar<T>(
  itens: T[],
  limite: number,
  tarefa: (item: T, indice: number) => Promise<void>,
): Promise<void> {
  let proximoIndice = 0;
  let primeiroErro: unknown;

  async function worker() {
    while (proximoIndice < itens.length) {
      const indice = proximoIndice++;
      try {
        await tarefa(itens[indice]!, indice);
      } catch (erro) {
        primeiroErro ??= erro;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, () => worker()));
  if (primeiroErro !== undefined) throw primeiroErro;
}

/** CNAEs distintos já presentes na base de candidatos — universo de busca no SICAF (ver docstring
 * do módulo para por que isso é seguro em vez de paginar o dataset inteiro sem filtro). */
async function listarCnaesDosCandidatos(): Promise<string[]> {
  const linhas = await db.$queryRaw<Array<{ cnaePrincipalCodigo: string }>>`
    SELECT "cnaePrincipalCodigo" FROM "empresas_candidatas_fornecedor" GROUP BY "cnaePrincipalCodigo"
  `;
  return linhas.map((l) => l.cnaePrincipalCodigo).filter((c) => c.trim() !== "");
}

export interface ResultadoEnriquecimentoSicaf {
  cnaesConsultados: number;
  cnpjsHabilitadosEncontrados: number;
  linhasMarcadas: number;
  linhasDesmarcadas: number;
}

export interface OpcoesEnriquecimentoSicaf {
  concorrencia?: number;
  dryRun?: boolean;
  onProgresso?: (progresso: ProgressoEnriquecimentoSicaf) => void;
  /**
   * Arquivo de checkpoint da COLETA. A coleta inteira leva vários minutos e a API impõe rate limit;
   * sem checkpoint, uma falha no CNAE 400 de 1.321 joga fora todo o trabalho já pago em requisições
   * (aconteceu em 2026-08-28: 340s e ~99 mil CNPJs perdidos por um 429). Com ele, a rodagem seguinte
   * retoma só os CNAEs que faltavam.
   *
   * O checkpoint cobre apenas a coleta — a ESCRITA continua tudo-ou-nada, porque marcar
   * `sicafHabilitado = false` com base numa leitura parcial diria "esta empresa não licita" sobre
   * quem apenas não foi lida ainda.
   */
  caminhoCheckpoint?: string;
}

interface Checkpoint {
  cnaesConcluidos: string[];
  cnpjs: string[];
}

async function lerCheckpoint(caminho: string): Promise<Checkpoint | null> {
  try {
    const conteudo = await readFile(caminho, "utf8");
    const dados = JSON.parse(conteudo) as Partial<Checkpoint>;
    if (!Array.isArray(dados.cnaesConcluidos) || !Array.isArray(dados.cnpjs)) return null;
    return { cnaesConcluidos: dados.cnaesConcluidos, cnpjs: dados.cnpjs };
  } catch {
    // Ausente ou corrompido: recomeça do zero, que é correto (só custa tempo, nunca dado errado).
    return null;
  }
}

async function gravarCheckpoint(caminho: string, checkpoint: Checkpoint): Promise<void> {
  // Escrita atômica: um Ctrl-C no meio de um write direto deixaria JSON truncado, e o checkpoint
  // corrompido só seria descoberto na próxima rodagem — justamente quando ele deveria ajudar.
  const temporario = `${caminho}.tmp`;
  await writeFile(temporario, JSON.stringify(checkpoint), "utf8");
  await rename(temporario, caminho);
}

export async function enriquecerCandidatosSicaf(
  opcoes: OpcoesEnriquecimentoSicaf = {},
): Promise<ResultadoEnriquecimentoSicaf> {
  const concorrencia = opcoes.concorrencia ?? CONCORRENCIA_PADRAO;
  const { caminhoCheckpoint } = opcoes;

  const cnaes = await listarCnaesDosCandidatos();

  const checkpoint = caminhoCheckpoint ? await lerCheckpoint(caminhoCheckpoint) : null;
  const cnpjs = new Set<string>(checkpoint?.cnpjs ?? []);
  const concluidos = new Set<string>(checkpoint?.cnaesConcluidos ?? []);
  const pendentes = cnaes.filter((c) => !concluidos.has(c));

  let cnaesProcessados = concluidos.size;
  let desdeUltimoCheckpoint = 0;

  await processarComConcorrenciaOuFalhar(pendentes, concorrencia, async (codigoCnae) => {
    await buscarTodoOCnae(codigoCnae, cnpjs);
    concluidos.add(codigoCnae);
    cnaesProcessados++;
    desdeUltimoCheckpoint++;

    if (caminhoCheckpoint && desdeUltimoCheckpoint >= 25) {
      desdeUltimoCheckpoint = 0;
      await gravarCheckpoint(caminhoCheckpoint, {
        cnaesConcluidos: [...concluidos],
        cnpjs: [...cnpjs],
      });
    }

    opcoes.onProgresso?.({
      cnaesProcessados,
      cnaesTotal: cnaes.length,
      cnpjsEncontrados: cnpjs.size,
    });
  });

  if (caminhoCheckpoint) {
    await gravarCheckpoint(caminhoCheckpoint, {
      cnaesConcluidos: [...concluidos],
      cnpjs: [...cnpjs],
    });
  }

  const listaCnpjs = [...cnpjs];
  let linhasMarcadas = 0;
  let linhasDesmarcadas = 0;

  if (!opcoes.dryRun) {
    linhasDesmarcadas = await db.$executeRaw`
      UPDATE "empresas_candidatas_fornecedor"
      SET "sicafHabilitado" = false, "sicafAtualizadoEm" = now()
      WHERE "sicafHabilitado" = true AND NOT ("cnpj" = ANY(${listaCnpjs}))
    `;

    for (let i = 0; i < listaCnpjs.length; i += TAMANHO_LOTE_UPDATE) {
      const lote = listaCnpjs.slice(i, i + TAMANHO_LOTE_UPDATE);
      linhasMarcadas += await db.$executeRaw`
        UPDATE "empresas_candidatas_fornecedor"
        SET "sicafHabilitado" = true, "sicafAtualizadoEm" = now()
        WHERE "cnpj" = ANY(${lote})
      `;
    }
  }

  return {
    cnaesConsultados: cnaes.length,
    cnpjsHabilitadosEncontrados: listaCnpjs.length,
    linhasMarcadas,
    linhasDesmarcadas,
  };
}
