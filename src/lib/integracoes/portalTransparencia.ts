import "server-only";
import { z } from "zod";

/**
 * Cliente para CEIS (Cadastro de Empresas Inidôneas e Suspensas) e CNEP
 * (Cadastro Nacional de Empresas Punidas) na API do Portal da Transparência
 * (CGU) — `api.portaldatransparencia.gov.br`.
 *
 * Verificado contra a API real e o OpenAPI (`/v3/api-docs`) em 2026-08-07
 * (CLAUDE.md §9.63 — não assumir formato de payload de memória):
 * - Endpoints: `GET /api-de-dados/ceis` e `GET /api-de-dados/cnep`, ambos com
 *   os mesmos parâmetros de query: `codigoSancionado` (CNPJ/CPF, opcional),
 *   `nomeSancionado`, `orgaoSancionador`, `dataInicialSancao`,
 *   `dataFinalSancao` (todos opcionais) e `pagina` (obrigatório, inteiro).
 * - Autenticação: header `chave-api-dados: <token>` (confirmado no
 *   `securitySchemes` do OpenAPI — é um `apiKey` em header, não Bearer).
 * - Sem header ou com token inválido, a API responde **HTTP 401** com corpo
 *   `{"Erro na API": "..."}` (confirmado com uma chamada real sem header e
 *   outra com token inválido — mensagens diferentes, mesmo código).
 * - Resposta de sucesso: array (não envelopado) de `CeisDTO`/`CnepDTO`. Campos
 *   usados aqui, confirmados no schema do OpenAPI:
 *   `sancionado.nome`, `sancionado.codigoFormatado`, `tipoSancao.descricaoResumida`,
 *   `orgaoSancionador.nome`, `dataInicioSancao`, `dataFimSancao`,
 *   `numeroProcesso`, `linkPublicacao`.
 *
 * **Limitação registrada explicitamente**: não obtivemos um token de produção
 * do Portal da Transparência nesta tarefa (cadastro de e-mail é manual, fora
 * do alcance deste ambiente) e a API rejeita qualquer chamada sem token válido
 * — não há como consultar um CNPJ real e confirmar um sancionado conhecido
 * contra a API viva. O formato de request/resposta abaixo foi validado contra
 * o OpenAPI publicado e contra o comportamento observado com token ausente/
 * inválido (401 nos dois casos, confirmado por chamada HTTP real); o
 * comportamento com token válido e resultado não-vazio permanece **não
 * verificado ao vivo**. Ver testes: o teste de fornecedor sancionado usa fixture
 * documentado como mock, não API real.
 */

const BASE_URL = "https://api.portaldatransparencia.gov.br";

const MAX_TENTATIVAS = 3;
const BACKOFF_BASE_MS = 500;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Validação da resposta (fronteira externa) ──────────────────────────────

const codigoDescricaoSchema = z.object({
  codigo: z.string().nullish(),
  descricao: z.string().nullish(),
});

const sancaoApiSchema = z.object({
  id: z.number().nullish(),
  dataInicioSancao: z.string().nullish(),
  dataFimSancao: z.string().nullish(),
  dataPublicacaoSancao: z.string().nullish(),
  tipoSancao: z
    .object({
      descricaoResumida: z.string().nullish(),
      descricaoPortal: z.string().nullish(),
    })
    .nullish(),
  fundamentacao: z.array(codigoDescricaoSchema).nullish(),
  orgaoSancionador: z
    .object({
      nome: z.string().nullish(),
      siglaUf: z.string().nullish(),
    })
    .nullish(),
  sancionado: z
    .object({
      nome: z.string().nullish(),
      codigoFormatado: z.string().nullish(),
    })
    .nullish(),
  textoPublicacao: z.string().nullish(),
  linkPublicacao: z.string().nullish(),
  numeroProcesso: z.string().nullish(),
});

const respostaListaSchema = z.array(sancaoApiSchema);

export interface SancaoEncontrada {
  origem: "CEIS" | "CNEP";
  tipoSancao: string | null;
  orgaoSancionador: string | null;
  dataInicioSancao: string | null;
  dataFimSancao: string | null;
  numeroProcesso: string | null;
  linkPublicacao: string | null;
}

export type ResultadoConsultaSancoes =
  | { negada: true; motivo: string }
  | { negada: false; sancoes: SancaoEncontrada[] };

async function buscarLista(
  endpoint: "ceis" | "cnep",
  codigoSancionado: string,
  token: string,
): Promise<SancaoEncontrada[] | null> {
  const params = new URLSearchParams({
    codigoSancionado,
    pagina: "1",
  });
  const url = `${BASE_URL}/api-de-dados/${endpoint}?${params.toString()}`;

  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "chave-api-dados": token },
      });

      if (res.ok) {
        const corpo: unknown = await res.json();
        const validado = respostaListaSchema.safeParse(corpo);
        if (!validado.success) {
          console.error(
            `[PortalTransparencia] Resposta de ${endpoint} fora do formato esperado`,
            validado.error,
          );
          return null;
        }
        return validado.data.map((s) => ({
          origem: endpoint === "ceis" ? "CEIS" : "CNEP",
          tipoSancao: s.tipoSancao?.descricaoResumida ?? s.tipoSancao?.descricaoPortal ?? null,
          orgaoSancionador: s.orgaoSancionador?.nome ?? null,
          dataInicioSancao: s.dataInicioSancao ?? null,
          dataFimSancao: s.dataFimSancao ?? null,
          numeroProcesso: s.numeroProcesso ?? null,
          linkPublicacao: s.linkPublicacao ?? null,
        }));
      }

      // 401 (token ausente/inválido) não é retryável — a chamada só ia repetir o mesmo erro.
      if (res.status === 401) {
        console.error(`[PortalTransparencia] HTTP 401 em ${endpoint} — token inválido ou expirado`);
        return null;
      }

      const retryavel = res.status === 429 || res.status >= 500;
      if (!retryavel || tentativa === MAX_TENTATIVAS) {
        console.warn(`[PortalTransparencia] HTTP ${res.status}: ${url}`);
        return null;
      }
    } catch (err) {
      ultimoErro = err;
      if (tentativa === MAX_TENTATIVAS) throw err;
      console.warn(
        `[PortalTransparencia] Falha de rede (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${url}`,
        err,
      );
    }
    await esperar(BACKOFF_BASE_MS * 2 ** (tentativa - 1));
  }
  return ultimoErro ? Promise.reject(ultimoErro) : null;
}

/**
 * Consulta CEIS e CNEP para um CNPJ (sem máscara ou com — a API aceita ambos
 * como texto livre em `codigoSancionado`, então normalizamos para dígitos).
 *
 * Guarda fail-closed (CLAUDE.md §9.45): sem `PORTAL_TRANSPARENCIA_TOKEN` no
 * ambiente, a consulta é **negada e sinalizada** — nunca tratada como "sem
 * sanção encontrada". `if (!token)` nega; nunca `if (token && ...)`.
 */
export async function consultarSancoesCnpj(cnpj: string): Promise<ResultadoConsultaSancoes> {
  const token = process.env.PORTAL_TRANSPARENCIA_TOKEN;
  if (!token) {
    return {
      negada: true,
      motivo:
        "PORTAL_TRANSPARENCIA_TOKEN não configurado — consulta de sanções (CEIS/CNEP) negada. " +
        "A ausência do token nunca é interpretada como 'fornecedor regular'.",
    };
  }

  const codigo = cnpj.replace(/\D/g, "");
  if (codigo.length !== 14) {
    return { negada: true, motivo: `CNPJ inválido para consulta: "${cnpj}"` };
  }

  try {
    const [ceis, cnep] = await Promise.all([
      buscarLista("ceis", codigo, token),
      buscarLista("cnep", codigo, token),
    ]);

    if (ceis === null && cnep === null) {
      return { negada: true, motivo: "Falha ao consultar CEIS e CNEP (ver logs)." };
    }

    return { negada: false, sancoes: [...(ceis ?? []), ...(cnep ?? [])] };
  } catch (err) {
    console.error("[PortalTransparencia] Erro inesperado ao consultar sanções:", err);
    return {
      negada: true,
      motivo: err instanceof Error ? `Erro inesperado: ${err.message}` : "Erro inesperado.",
    };
  }
}
