import { afterEach, describe, expect, it, vi } from "vitest";

// Confirma que o client nunca herda o timeout/retries default do SDK da OpenAI
// (~10min, 2 retries) — fatal numa Server Action sob `maxDuration = 60`
// (CLAUDE.md §9.64, causa do 504 no upload do TR do processo 908/2022).

const OpenAIMock = vi.fn();
vi.mock("openai", () => ({ default: OpenAIMock }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  OpenAIMock.mockClear();
});

describe("getOpenAIClient", () => {
  it("cria o client com timeout e maxRetries limitados", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const { getOpenAIClient } = await import("../openaiClient");

    getOpenAIClient();

    expect(OpenAIMock).toHaveBeenCalledWith({
      apiKey: "test-key",
      timeout: 20_000,
      maxRetries: 1,
    });
  });

  it("reusa a mesma instância entre chamadas (não recria o client a cada uso)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const { getOpenAIClient } = await import("../openaiClient");

    const a = getOpenAIClient();
    const b = getOpenAIClient();

    expect(a).toBe(b);
    expect(OpenAIMock).toHaveBeenCalledTimes(1);
  });

  it("lança erro claro quando OPENAI_API_KEY está ausente", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const { getOpenAIClient } = await import("../openaiClient");

    expect(() => getOpenAIClient()).toThrow("OPENAI_API_KEY não configurada.");
  });
});
