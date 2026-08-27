import { describe, it, expect } from "vitest";
import { montarPromptSistema, type ContextoPrompt } from "../promptSistema";

function contexto(overrides: Partial<ContextoPrompt> = {}): ContextoPrompt {
  return {
    instrucoesPesquisa: "",
    processoNumero: null,
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

  // Em 2026-08-27 o assistente listou cinco contratações do PNCP pelo nome do
  // órgão e sem nenhum link. As URLs existiam no banco e `ler_candidatos` as
  // entregava no campo `url` — faltava a instrução de usá-las. Como esses
  // candidatos não geram card, o texto era o único caminho até o edital, e o
  // servidor ficou sem como conferir a evidência.
  it("manda citar candidato com link em markdown", () => {
    const prompt = montarPromptSistema(contexto());

    expect(prompt).toMatch(/\[.*\]\(url\)/);
    expect(prompt).toMatch(/ler_candidatos/);
    expect(prompt).toMatch(/não geram card|NÃO geram card/i);
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
    const prompt = montarPromptSistema(contexto({ buscaWebPerplexity: false }));

    expect(prompt).toContain("PNCP");
    expect(prompt).not.toContain("Perplexity");
  });

  // O que o usuário reclamou em 2026-08-26: "ele não me traz em card, traz em
  // texto". A causa estrutural era o `web_search` hospedado (removido), mas o
  // prompt também precisa dizer de onde vem o card, senão o modelo acha que
  // resumir a web é resposta.
  it("diz que só buscar_pncp gera card", () => {
    const prompt = montarPromptSistema(contexto());
    // O prompt quebra a linha no meio da frase — casar espaço em branco, não " ".
    expect(prompt).toMatch(/só "buscar_pncp"\s+gera card/i);
    expect(prompt).toMatch(/não um resumo em texto/i);
  });

  // A regra anterior mandava emendar buscar_pncp na mesma rodada da web. Com
  // reserva de 30s para a busca e teto de 40s para as ferramentas do turno, as
  // duas não cabem: a instrução prometia o que o orçamento barra (§9.40).
  it("não manda encadear busca web e busca no PNCP no mesmo turno", () => {
    const prompt = montarPromptSistema(contexto());
    expect(prompt).toMatch(/NÃO cabe no mesmo turno/i);
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
