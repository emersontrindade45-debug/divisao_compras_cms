import { describe, it, expect } from "vitest";
import { montarPromptSistema, type ContextoPrompt } from "../promptSistema";

function contexto(overrides: Partial<ContextoPrompt> = {}): ContextoPrompt {
  return {
    instrucoesPesquisa: "",
    processoNumero: null,
    buscaWebOpenAI: true,
    buscaWebPerplexity: true,
    maxPassos: 8,
    ...overrides,
  };
}

describe("montarPromptSistema", () => {
  it("declara os limites de conformidade que o assistente não pode contornar", () => {
    const prompt = montarPromptSistema(contexto());

    expect(prompt).toMatch(/registra candidatos/i);
    expect(prompt).toMatch(/nunca cria Fonte/i);
    expect(prompt).toMatch(/site eletrônico/i);
    expect(prompt).toMatch(/não envia e-mail/i);
  });

  it("ancora a conversa no processo quando há um", () => {
    const prompt = montarPromptSistema(contexto({ processoNumero: "2026/0042" }));
    expect(prompt).toContain("2026/0042");
  });

  // Sem processo, "o item 3" é ambíguo — o assistente tem de perguntar em vez de
  // buscar no processo errado.
  it("manda perguntar qual processo na conversa global", () => {
    const prompt = montarPromptSistema(contexto({ processoNumero: null }));
    expect(prompt).toMatch(/pergunte antes de buscar/i);
  });

  it("lista só as fontes de busca realmente disponíveis", () => {
    const prompt = montarPromptSistema(
      contexto({ buscaWebPerplexity: false, buscaWebOpenAI: false }),
    );

    expect(prompt).toContain("PNCP");
    expect(prompt).not.toContain("Perplexity");
    expect(prompt).not.toContain("OpenAI)");
  });

  it("anuncia a Perplexity quando ela está configurada", () => {
    const prompt = montarPromptSistema(contexto({ buscaWebPerplexity: true }));
    expect(prompt).toContain("Perplexity");
  });

  it("informa o orçamento de passos do turno", () => {
    const prompt = montarPromptSistema(contexto({ maxPassos: 4 }));
    expect(prompt).toContain("máximo 4 ferramentas");
  });

  it("não injeta seção de instruções quando não há nenhuma", () => {
    const prompt = montarPromptSistema(contexto({ instrucoesPesquisa: "" }));
    expect(prompt).not.toContain("Instruções de pesquisa definidas");
  });

  it("acrescenta as instruções do órgão ao final, depois das regras base", () => {
    const instrucoes = "## Instruções de pesquisa definidas pela Divisão de Compras\nRegra X.";
    const prompt = montarPromptSistema(contexto({ instrucoesPesquisa: instrucoes }));

    expect(prompt).toContain("Regra X.");
    // Por último para ter precedência na leitura do modelo.
    expect(prompt.indexOf("Regra X.")).toBeGreaterThan(prompt.indexOf("Limites que você"));
  });
});
