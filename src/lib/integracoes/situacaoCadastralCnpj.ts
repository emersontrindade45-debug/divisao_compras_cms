// Sem `import "server-only"` deliberadamente (CLAUDE.md §9.62) — mesmo motivo de `openaiClient.ts`.
import { z } from "zod";

/**
 * Cliente de dados cadastrais de CNPJ via BrasilAPI (`brasilapi.com.br`),
 * que espelha os dados públicos da Receita Federal.
 *
 * Decisão de fonte (M19): entre BrasilAPI, Minha Receita e a API paga da
 * Receita, a BrasilAPI foi escolhida porque:
 * - é gratuita e **sem token** (confirmado por chamada real, HTTP 200 sem
 *   nenhum header de autenticação) — não compete pelo mesmo tipo de guarda
 *   fail-closed que CEIS/CNEP exige, então não há risco de silenciar essa
 *   consulta por falta de segredo;
 * - é mantida com infraestrutura própria (não depende de scraping ao vivo do
 *   site da Receita a cada chamada, ao contrário da Minha Receita, que faz
 *   proxy síncrono e é mais sujeita a instabilidade sob carga);
 * - devolve o campo `situacao_cadastral`/`descricao_situacao_cadastral`
 *   estruturado, o que a Minha Receita também tem mas com esquema menos
 *   documentado publicamente.
 *
 * Verificado contra a API real em 2026-08-07 (CLAUDE.md §9.63) e de novo em
 * 2026-08-19 (M26 — enriquecimento cadastral): `GET
 * https://brasilapi.com.br/api/cnpj/v1/{cnpj}` (só dígitos, sem máscara).
 * - CNPJ existente: HTTP 200, corpo com `descricao_situacao_cadastral`
 *   (ex.: `"ATIVA"`), `situacao_cadastral` (código numérico),
 *   `motivo_situacao_cadastral`, `data_situacao_cadastral`, `razao_social`,
 *   e também `municipio`, `uf`, `cnae_fiscal_descricao`, `cnaes_secundarios`
 *   (array de `{codigo, descricao}`), `email` e `ddd_telefone_1`/
 *   `ddd_telefone_2` (dígitos crus, DDD+número concatenados, sem formatação —
 *   ex. `"6134939002"`; vazio quando a Receita não tem o telefone). Testado
 *   com o CNPJ público 00.000.000/0001-91 (Banco do Brasil).
 * - CNPJ inexistente: HTTP 404, corpo
 *   `{"message": "...", "type": "not_found", "name": "NotFoundError"}`.
 *
 * `buscarCnpjNaBrasilApi` concentra a chamada HTTP (validação + retry/backoff
 * em 429/5xx) — `consultarSituacaoCadastral` (M19) e `consultarDadosCadastraisCnpj`
 * (M26) são as duas visões específicas sobre o mesmo corpo de resposta.
 */

const BASE_URL = "https://brasilapi.com.br/api/cnpj/v1";

// MAX_TENTATIVAS subiu de 3 para 4 em 2026-08-19 (M26): rodagem em lote contra produção teve 688/1273
// candidatos bucketados como "não encontrado" — número incompatível com a base real de CNPJs válidos,
// consistente com 429 esgotando as tentativas sob concorrência (ver enriquecerFornecedoresPorCnpj.ts).
const MAX_TENTATIVAS = 4;
const BACKOFF_BASE_MS = 500;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const cnaeSecundarioSchema = z.object({
  codigo: z.number().nullish(),
  descricao: z.string().nullish(),
});

const cnpjApiSchema = z.object({
  cnpj: z.string().nullish(),
  razao_social: z.string().nullish(),
  nome_fantasia: z.string().nullish(),
  situacao_cadastral: z.number().nullish(),
  descricao_situacao_cadastral: z.string().nullish(),
  motivo_situacao_cadastral: z.number().nullish(),
  descricao_motivo_situacao_cadastral: z.string().nullish(),
  data_situacao_cadastral: z.string().nullish(),
  municipio: z.string().nullish(),
  uf: z.string().nullish(),
  cnae_fiscal_descricao: z.string().nullish(),
  cnaes_secundarios: z.array(cnaeSecundarioSchema).nullish(),
  email: z.string().nullish(),
  ddd_telefone_1: z.string().nullish(),
  ddd_telefone_2: z.string().nullish(),
});

type DadosCnpjApi = z.infer<typeof cnpjApiSchema>;

type ResultadoBuscaBrasilApi = { ok: true; dados: DadosCnpjApi } | { ok: false; motivo: string };

/** Chamada HTTP crua à BrasilAPI, com validação de formato e retry em 429/5xx. */
async function buscarCnpjNaBrasilApi(cnpj: string): Promise<ResultadoBuscaBrasilApi> {
  const codigo = cnpj.replace(/\D/g, "");
  if (codigo.length !== 14) {
    return { ok: false, motivo: `CNPJ inválido para consulta: "${cnpj}"` };
  }

  const url = `${BASE_URL}/${codigo}`;

  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      // `User-Agent` é obrigatório: confirmado em 2026-08-19 (M26) que a BrasilAPI devolve HTTP 403
      // (sem retry — 403 não está na faixa retryável) para requisições sem esse header. O `fetch`
      // nativo do Node não injeta um `User-Agent` sozinho (diferente do `curl`), então sem isto toda
      // consulta falhava silenciosamente como "não encontrado" — reproduzido comparando `curl` (200)
      // contra `fetch` do Node sem header (403) para o mesmo CNPJ.
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "divisao-compras-cms" },
      });

      if (res.ok) {
        const corpo: unknown = await res.json();
        const validado = cnpjApiSchema.safeParse(corpo);
        if (!validado.success) {
          console.error("[SituacaoCadastralCnpj] Resposta fora do formato esperado", validado.error);
          return { ok: false, motivo: "Resposta da BrasilAPI fora do formato esperado." };
        }
        return { ok: true, dados: validado.data };
      }

      if (res.status === 404) {
        return { ok: false, motivo: "CNPJ não encontrado na Receita Federal." };
      }

      const retryavel = res.status === 429 || res.status >= 500;
      if (!retryavel || tentativa === MAX_TENTATIVAS) {
        return { ok: false, motivo: `BrasilAPI respondeu HTTP ${res.status}.` };
      }
    } catch (err) {
      ultimoErro = err;
      if (tentativa === MAX_TENTATIVAS) {
        return {
          ok: false,
          motivo: err instanceof Error ? `Falha de rede: ${err.message}` : "Falha de rede.",
        };
      }
      console.warn(
        `[SituacaoCadastralCnpj] Falha de rede (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${url}`,
        err,
      );
    }
    await esperar(BACKOFF_BASE_MS * 2 ** (tentativa - 1));
  }
  return {
    ok: false,
    motivo: ultimoErro instanceof Error ? ultimoErro.message : "Falha desconhecida.",
  };
}

export type ResultadoSituacaoCadastral =
  | { encontrado: true; situacao: string; razaoSocial: string | null; dataSituacao: string | null }
  | { encontrado: false; motivo: string };

/**
 * Consulta a situação cadastral de um CNPJ na Receita Federal via BrasilAPI.
 * Não exige token — sem guarda fail-closed de credencial, mas com o mesmo
 * cuidado de nunca inventar um resultado quando a chamada falha: erro de
 * rede/formato inesperado vira `{ encontrado: false, motivo }`, nunca um
 * "ATIVA" silencioso.
 */
export async function consultarSituacaoCadastral(
  cnpj: string,
): Promise<ResultadoSituacaoCadastral> {
  const resultado = await buscarCnpjNaBrasilApi(cnpj);
  if (!resultado.ok) return { encontrado: false, motivo: resultado.motivo };

  if (!resultado.dados.descricao_situacao_cadastral) {
    return { encontrado: false, motivo: "BrasilAPI não retornou situação cadastral." };
  }
  return {
    encontrado: true,
    situacao: resultado.dados.descricao_situacao_cadastral,
    razaoSocial: resultado.dados.razao_social ?? null,
    dataSituacao: resultado.dados.data_situacao_cadastral ?? null,
  };
}

export interface DadosCadastraisCnpj {
  municipio: string | null;
  uf: string | null;
  /** CNAE fiscal principal + secundários, descrições concatenadas — usado como texto-fonte para sugerir Tag (M26). */
  atividadesEconomicas: string[];
  email: string | null;
  /** Dígitos crus (DDD+número), sem formatação — quem grava formata. `ddd_telefone_1`, com fallback para `ddd_telefone_2`. */
  telefone: string | null;
  /** Razão social oficial da Receita para este CNPJ — fonte de verdade para corrigir cadastro divergente (M26). */
  razaoSocial: string | null;
}

export type ResultadoDadosCadastraisCnpj =
  | { encontrado: true; dados: DadosCadastraisCnpj }
  | { encontrado: false; motivo: string };

/**
 * Consulta município/UF/atividade econômica (CNAE)/e-mail/telefone/razão
 * social de um CNPJ na BrasilAPI — usado pelo enriquecimento em lote de
 * `Fornecedor` (M26): a chave de busca é o CNPJ (exata), nunca nome de
 * empresa, então não há ambiguidade de correspondência como haveria numa
 * busca por razão social.
 */
export async function consultarDadosCadastraisCnpj(
  cnpj: string,
): Promise<ResultadoDadosCadastraisCnpj> {
  const resultado = await buscarCnpjNaBrasilApi(cnpj);
  if (!resultado.ok) return { encontrado: false, motivo: resultado.motivo };

  const atividadesEconomicas = [
    resultado.dados.cnae_fiscal_descricao,
    ...(resultado.dados.cnaes_secundarios ?? []).map((c) => c.descricao),
  ].filter((d): d is string => !!d?.trim());

  const telefone = resultado.dados.ddd_telefone_1?.trim() || resultado.dados.ddd_telefone_2?.trim() || null;

  return {
    encontrado: true,
    dados: {
      municipio: resultado.dados.municipio ?? null,
      uf: resultado.dados.uf ?? null,
      atividadesEconomicas,
      email: resultado.dados.email ?? null,
      telefone,
      razaoSocial: resultado.dados.razao_social?.trim() || null,
    },
  };
}
