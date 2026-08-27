import "server-only";
import type { CandidatoSimilaridade } from "@/lib/ia/types";
import type { FiltrosBuscaPNCP } from "@/lib/integracoes/pncp";
import { REGISTRY_PROVEDORES_PUBLICOS } from "./registryProvedores";
import { comTimeout } from "./comTimeout";
import { deduplicarCandidatos } from "./deduplicarCandidatos";

/**
 * Busca candidatos de similaridade em todos os provedores públicos
 * habilitados do registry (`REGISTRY_PROVEDORES_PUBLICOS`), em paralelo.
 *
 * Isolamento de falha (docs/ApiPlan.md §3.4): `Promise.allSettled`, não
 * `Promise.all` — antes do M15, uma exceção lançada fora do `try/catch`
 * interno de um cliente (ex.: erro síncrono antes do primeiro `await`)
 * derrubava a busca inteira, e o fato de isso não acontecer na prática era
 * acidente de cada cliente sempre encapsular sua chamada de rede em
 * `try/catch → []`, não desenho deste orquestrador. Cada provedor também tem
 * um timeout individual (`comTimeout`): fonte lenta ou fora do ar degrada o
 * resultado — perdem-se só as sugestões dela — em vez de travar a busca pelo
 * tempo que ela levar.
 *
 * Deduplicação entre provedores (`deduplicarCandidatos`) roda depois de
 * juntar os resultados: a mesma contratação pode aparecer tanto no PNCP
 * quanto no Painel de Preços/Compras.gov.
 */
export interface OpcoesBuscarCandidatosPublicos {
  /**
   * Sobrescreve o `timeoutMs` de cada provedor do registry. Usado pelo
   * assistente de IA (`lib/assistente/ferramentas.ts`), cujo orçamento por
   * turno (`ORCAMENTO_TEMPO_TURNO_MS`, 35s) é bem mais apertado que o da
   * Server Action síncrona (`pesquisaSimilaridade.ts`) — sem isso, uma única
   * chamada de ferramenta poderia gastar os 25s padrão de cada provedor e
   * estourar o `maxDuration` da rota de chat (CLAUDE.md §9.64/65). Omitido,
   * usa o `timeoutMs` que cada provedor já declara no registry.
   */
  timeoutMsPorProvedor?: number;
  /**
   * Recorte pedido pelo analista (UF, esfera, situação). Repassado a todos os
   * provedores; **só os que declaram `aplicaFiltros` de fato o aplicam** — ver
   * `FONTES_QUE_IGNORAM_FILTROS`, que é o que permite ao chamador avisar em vez
   * de deixar a diferença silenciosa.
   */
  filtros?: FiltrosBuscaPNCP;
}

/**
 * Fontes habilitadas que NÃO sabem aplicar o recorte do analista. Exportada para
 * que a camada de cima possa dizer isso ao usuário: pedir "só SP" e receber
 * resultado nacional de três das quatro fontes, sem aviso, é o modo de falha da
 * CLAUDE.md §9.40.
 */
export function fontesQueIgnoramFiltros(): string[] {
  return REGISTRY_PROVEDORES_PUBLICOS.filter((p) => p.habilitado && !p.aplicaFiltros).map(
    (p) => p.chave,
  );
}

/**
 * Resultado da busca junto com o que deu errado ao produzi-lo.
 *
 * `provedoresQueFalharam` existe porque uma lista vazia tem duas causas
 * incompatíveis — "as fontes responderam e não têm nada" e "as fontes não
 * responderam" — e colapsar as duas fazia o assistente afirmar ao analista que
 * não existem contratações para o objeto quando o que houve foi falha de rede
 * (CLAUDE.md §9.93). Sem este canal a informação morre no `console.error`
 * abaixo, que ninguém lê durante uma pesquisa de preços.
 */
export interface ResultadoBuscaPublica {
  candidatos: CandidatoSimilaridade[];
  /** Chaves do registry (`pncp`, `painel_precos`, …) que falharam ou expiraram. */
  provedoresQueFalharam: string[];
}

export async function buscarCandidatosPublicosComDiagnostico(
  termo: string,
  opcoes: OpcoesBuscarCandidatosPublicos = {},
): Promise<ResultadoBuscaPublica> {
  const provedoresHabilitados = REGISTRY_PROVEDORES_PUBLICOS.filter((provedor) => provedor.habilitado);

  const resultados = await Promise.allSettled(
    provedoresHabilitados.map((provedor) =>
      comTimeout(
        provedor.buscar(termo, opcoes.filtros),
        opcoes.timeoutMsPorProvedor ?? provedor.timeoutMs,
        provedor.chave,
      ),
    ),
  );

  const candidatos: CandidatoSimilaridade[] = [];
  const provedoresQueFalharam: string[] = [];
  resultados.forEach((resultado, indice) => {
    if (resultado.status === "fulfilled") {
      candidatos.push(...resultado.value);
      return;
    }
    const provedor = provedoresHabilitados[indice];
    provedoresQueFalharam.push(provedor.chave);
    console.error(
      `[buscarCandidatosPublicos] Provedor "${provedor.chave}" falhou/expirou para "${termo}":`,
      resultado.reason,
    );
  });

  return { candidatos: deduplicarCandidatos(candidatos), provedoresQueFalharam };
}

/**
 * Só os candidatos, para os chamadores que não têm o que fazer com o
 * diagnóstico — a Server Action de similaridade roda em lote sobre vários itens
 * e não tem onde reportar falha por termo. O assistente usa a versão acima.
 */
export async function buscarCandidatosPublicos(
  termo: string,
  opcoes: OpcoesBuscarCandidatosPublicos = {},
): Promise<CandidatoSimilaridade[]> {
  const { candidatos } = await buscarCandidatosPublicosComDiagnostico(termo, opcoes);
  return candidatos;
}
