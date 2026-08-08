import "server-only";
import { buscarContratosPNCP } from "@/lib/integracoes/pncp";
import { buscarPrecosPainelPrecos } from "@/lib/integracoes/painelPrecos";
import { buscarCandidatosComprasGovContratacoes } from "./provedorComprasGovContratacoes";
import { buscarCandidatosSinapi } from "./provedorSinapi";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

/**
 * Um provedor de busca pública de candidatos de similaridade.
 *
 * Interface única para tornar barato acrescentar fonte (docs/ApiPlan.md
 * §3.4/M15): um provedor novo (SINAPI, CADTERC, ... via M16+) só precisa
 * implementar `buscar` e entrar nesta lista — `buscarCandidatosPublicos` cuida
 * de isolamento de falha, timeout e deduplicação para todos igualmente.
 */
export interface ProvedorBuscaPublica {
  /** Identificador estável do provedor — usado em logs; não é exibido ao usuário. */
  chave: string;
  /** Provedor desabilitado é pulado sem gastar tempo de rede nem entrar no `Promise.allSettled`. */
  habilitado: boolean;
  /** Teto de tempo do provedor (ver `comTimeout`): estourar não derruba a busca dos demais. */
  timeoutMs: number;
  buscar: (termo: string) => Promise<CandidatoSimilaridade[]>;
}

// Os dois provedores atuais já respondiam via Promise.all antes do M15; o
// teto aqui é generoso porque o PNCP soma retries com backoff por processo
// encontrado (ver pncp.ts) — o registry só precisa parar de esperar por um
// provedor preso, não competir pelo menor tempo possível.
const TIMEOUT_PADRAO_MS = 25_000;

// Cada função é envolvida numa arrow function (em vez de referenciada
// diretamente, ex. `buscar: buscarContratosPNCP`) para que a chamada resolva
// o identificador importado no momento da invocação, não no momento em que
// este array é avaliado — é o que permite `vi.spyOn` interceptar a chamada
// nos testes (a mesma razão pela qual o código anterior chamava a função
// diretamente dentro de `Promise.all`, em vez de capturá-la numa constante).
export const REGISTRY_PROVEDORES_PUBLICOS: readonly ProvedorBuscaPublica[] = [
  {
    chave: "pncp",
    habilitado: true,
    timeoutMs: TIMEOUT_PADRAO_MS,
    buscar: (termo) => buscarContratosPNCP(termo),
  },
  {
    chave: "painel_precos",
    habilitado: true,
    timeoutMs: TIMEOUT_PADRAO_MS,
    buscar: (termo) => buscarPrecosPainelPrecos(termo),
  },
  {
    // Compras.gov — `modulo-contratacoes` (M16, docs/ApiPlan.md §4.1). Fecha a
    // lacuna de material de consumo e TI/equipamentos: matching local sobre o
    // catálogo CATMAT ingerido (`matchingCatalogoLocal.ts`) → itens de
    // contratação por código. Habilitado mesmo com `ItemCatalogoReferencia`
    // ainda vazia em produção — o provedor vira um no-op seguro (`[]` cedo,
    // com log de diagnóstico) até a ingestão real do catálogo rodar.
    chave: "compras_gov_contratacoes",
    habilitado: true,
    timeoutMs: TIMEOUT_PADRAO_MS,
    buscar: (termo) => buscarCandidatosComprasGovContratacoes(termo),
  },
  {
    // SINAPI — Composições Sintético (M17, docs/ApiPlan.md). Sem chamada de
    // rede: consulta direta a `PrecoReferencia` já ingerida
    // (src/lib/ingestao/ingerirSinapi.ts), então o timeout aqui é folga
    // sobre uma query de banco, não sobre latência de API externa — mas
    // mantém o mesmo teto que os demais para não exigir orçamento próprio.
    // Habilitado mesmo com a tabela ainda vazia em produção (ingestão real
    // ainda não rodou): vira um no-op seguro (`[]` cedo), mesmo padrão do
    // provedor Compras.gov.
    chave: "sinapi",
    habilitado: true,
    timeoutMs: TIMEOUT_PADRAO_MS,
    buscar: (termo) => buscarCandidatosSinapi(termo),
  },
];
