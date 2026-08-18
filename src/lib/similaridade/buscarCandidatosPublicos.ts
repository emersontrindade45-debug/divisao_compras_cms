import "server-only";
import type { CandidatoSimilaridade } from "@/lib/ia/types";
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
}

export async function buscarCandidatosPublicos(
  termo: string,
  opcoes: OpcoesBuscarCandidatosPublicos = {},
): Promise<CandidatoSimilaridade[]> {
  const provedoresHabilitados = REGISTRY_PROVEDORES_PUBLICOS.filter((provedor) => provedor.habilitado);

  const resultados = await Promise.allSettled(
    provedoresHabilitados.map((provedor) =>
      comTimeout(
        provedor.buscar(termo),
        opcoes.timeoutMsPorProvedor ?? provedor.timeoutMs,
        provedor.chave,
      ),
    ),
  );

  const candidatos: CandidatoSimilaridade[] = [];
  resultados.forEach((resultado, indice) => {
    if (resultado.status === "fulfilled") {
      candidatos.push(...resultado.value);
      return;
    }
    const provedor = provedoresHabilitados[indice];
    console.error(
      `[buscarCandidatosPublicos] Provedor "${provedor.chave}" falhou/expirou para "${termo}":`,
      resultado.reason,
    );
  });

  return deduplicarCandidatos(candidatos);
}
