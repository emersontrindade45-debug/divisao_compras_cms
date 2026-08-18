import "server-only";
import OpenAI from "openai";

let client: OpenAI | null = null;

/**
 * Teto por chamada. O SDK da OpenAI vem, por padrão, com timeout de ~10min e 2
 * retries — inofensivo num script, fatal numa Server Action sob `maxDuration =
 * 60` (CLAUDE.md §9.64): uma chamada presa consome sozinha o teto da função
 * serverless e a Vercel mata a função sem resposta estruturada (504 genérico).
 * 20s é folga sobre a latência real de extração/ranking observada em uso, e
 * deixa espaço para o orçamento agregado do chamador (ver `pesquisaSimilaridade.ts`).
 */
const TIMEOUT_OPENAI_MS = 20_000;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY não configurada.");
    }
    client = new OpenAI({ apiKey, timeout: TIMEOUT_OPENAI_MS, maxRetries: 1 });
  }
  return client;
}

export const OPENAI_MODEL = "gpt-4o-mini";
