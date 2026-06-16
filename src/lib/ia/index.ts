export type { ItemExtraidoTR, CandidatoSimilaridade, ScoreSimilaridade, ProvedorIA } from "./types";
export { GeminiProvider } from "./geminiProvider";

import { GeminiProvider } from "./geminiProvider";
import type { ProvedorIA } from "./types";

export function getProvedorIA(): ProvedorIA {
  return new GeminiProvider();
}
