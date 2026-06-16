import "server-only";
import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY não configurada.");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export const GEMINI_MODEL = "gemini-flash-latest";
