import "server-only";
import { z } from "zod";

/**
 * Cliente de situação cadastral de CNPJ via BrasilAPI (`brasilapi.com.br`),
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
 * Verificado contra a API real em 2026-08-07 (CLAUDE.md §9.63):
 * `GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}` (só dígitos, sem máscara).
 * - CNPJ existente: HTTP 200, corpo com `descricao_situacao_cadastral`
 *   (ex.: `"ATIVA"`), `situacao_cadastral` (código numérico),
 *   `motivo_situacao_cadastral`, `data_situacao_cadastral`, `razao_social`.
 *   Testado com o CNPJ público 00.000.000/0001-91 (Banco do Brasil).
 * - CNPJ inexistente: HTTP 404, corpo
 *   `{"message": "...", "type": "not_found", "name": "NotFoundError"}`.
 */

const BASE_URL = "https://brasilapi.com.br/api/cnpj/v1";

const MAX_TENTATIVAS = 3;
const BACKOFF_BASE_MS = 500;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const cnpjApiSchema = z.object({
  cnpj: z.string().nullish(),
  razao_social: z.string().nullish(),
  nome_fantasia: z.string().nullish(),
  situacao_cadastral: z.number().nullish(),
  descricao_situacao_cadastral: z.string().nullish(),
  motivo_situacao_cadastral: z.number().nullish(),
  descricao_motivo_situacao_cadastral: z.string().nullish(),
  data_situacao_cadastral: z.string().nullish(),
});

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
  const codigo = cnpj.replace(/\D/g, "");
  if (codigo.length !== 14) {
    return { encontrado: false, motivo: `CNPJ inválido para consulta: "${cnpj}"` };
  }

  const url = `${BASE_URL}/${codigo}`;

  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });

      if (res.ok) {
        const corpo: unknown = await res.json();
        const validado = cnpjApiSchema.safeParse(corpo);
        if (!validado.success) {
          console.error("[SituacaoCadastralCnpj] Resposta fora do formato esperado", validado.error);
          return { encontrado: false, motivo: "Resposta da BrasilAPI fora do formato esperado." };
        }
        if (!validado.data.descricao_situacao_cadastral) {
          return { encontrado: false, motivo: "BrasilAPI não retornou situação cadastral." };
        }
        return {
          encontrado: true,
          situacao: validado.data.descricao_situacao_cadastral,
          razaoSocial: validado.data.razao_social ?? null,
          dataSituacao: validado.data.data_situacao_cadastral ?? null,
        };
      }

      if (res.status === 404) {
        return { encontrado: false, motivo: "CNPJ não encontrado na Receita Federal." };
      }

      const retryavel = res.status === 429 || res.status >= 500;
      if (!retryavel || tentativa === MAX_TENTATIVAS) {
        return { encontrado: false, motivo: `BrasilAPI respondeu HTTP ${res.status}.` };
      }
    } catch (err) {
      ultimoErro = err;
      if (tentativa === MAX_TENTATIVAS) {
        return {
          encontrado: false,
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
    encontrado: false,
    motivo: ultimoErro instanceof Error ? ultimoErro.message : "Falha desconhecida.",
  };
}
