export type { ItemExtraidoTR, CandidatoSimilaridade, ScoreSimilaridade, ProvedorIA } from "./types";
export { OpenAIProvider } from "./openaiProvider";

import { OpenAIProvider } from "./openaiProvider";
import type { ProvedorIA } from "./types";

/**
 * Único provedor de IA em produção (decisão M11 — ver docs/PLAN.md).
 * `ProvedorIA` continua sendo uma interface própria (não um tipo do SDK da OpenAI)
 * para permitir trocar de provedor no futuro sem tocar em `lib/similaridade/`.
 */
export function getProvedorIA(): ProvedorIA {
  return new OpenAIProvider();
}
