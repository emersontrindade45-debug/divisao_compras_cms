export type { ItemExtraidoTR, CandidatoSimilaridade, ScoreSimilaridade, ProvedorIA } from "./types";
export { GeminiProvider } from "./geminiProvider";
export { OpenAIProvider } from "./openaiProvider";

import { OpenAIProvider } from "./openaiProvider";
import type { ProvedorIA } from "./types";

export function getProvedorIA(): ProvedorIA {
  return new OpenAIProvider();
}
