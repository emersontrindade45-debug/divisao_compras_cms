import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("../openaiClient", () => ({
  getOpenAIClient: () => ({ chat: { completions: { create: mocks.create } } }),
  OPENAI_MODEL: "gpt-4o-mini",
}));

import { gerarTagCnae, sugerirCategoriasParaObjeto } from "../categorizarObjeto";

function mockResposta(categorias: string[]) {
  mocks.create.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ categorias }) } }],
  });
}

describe("sugerirCategoriasParaObjeto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna [] sem chamar a IA quando o objeto está vazio", async () => {
    const resultado = await sugerirCategoriasParaObjeto("", ["água", "limpeza"]);

    expect(resultado).toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("retorna [] sem chamar a IA quando não há categorias disponíveis", async () => {
    const resultado = await sugerirCategoriasParaObjeto("Aquisição de água mineral", []);

    expect(resultado).toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("retorna as categorias sugeridas pela IA quando estão na lista disponível", async () => {
    mockResposta(["água"]);

    const resultado = await sugerirCategoriasParaObjeto("Aquisição de água mineral", [
      "água",
      "limpeza",
      "informática",
    ]);

    expect(resultado).toEqual(["água"]);
  });

  // Guarda contra alucinação (CLAUDE.md §9.12): a IA pode "inventar" uma categoria
  // parecida mas que não existe no cadastro real — casamento posterior é por
  // igualdade exata de string, então propagar isso pra UI é lixo silencioso.
  it("descarta categoria que a IA retornou mas que NÃO está na lista disponível", async () => {
    mockResposta(["água mineral", "limpeza"]); // "água mineral" não existe na lista

    const resultado = await sugerirCategoriasParaObjeto("Aquisição de água mineral", [
      "água",
      "limpeza",
    ]);

    expect(resultado).toEqual(["limpeza"]);
  });

  it("envia a lista de categorias disponíveis e o objeto no prompt", async () => {
    mockResposta([]);

    await sugerirCategoriasParaObjeto("Reforma do telhado", ["construção", "elétrica"]);

    const chamada = mocks.create.mock.calls[0]![0];
    expect(chamada.messages[0].content).toContain("Reforma do telhado");
    expect(chamada.messages[0].content).toContain("construção");
    expect(chamada.messages[0].content).toContain("elétrica");
    expect(chamada.response_format).toEqual({ type: "json_object" });
  });

  it("lança erro claro quando a resposta da IA não é o JSON esperado", async () => {
    mocks.create.mockResolvedValue({ choices: [{ message: { content: "não é json" } }] });

    await expect(
      sugerirCategoriasParaObjeto("Aquisição de água mineral", ["água"]),
    ).rejects.toThrow(/sugerirCategoriasParaObjeto/);
  });
});

describe("gerarTagCnae", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna [] sem chamar a IA quando a descrição está vazia", async () => {
    const resultado = await gerarTagCnae("");

    expect(resultado).toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("retorna a tag gerada pela IA, sem filtrar contra nenhuma lista pré-existente", async () => {
    mockResposta(["telecomunicações"]);

    const resultado = await gerarTagCnae("Provedores de acesso às redes de comunicações");

    expect(resultado).toEqual(["telecomunicações"]);
  });

  // Ao contrário de `sugerirCategoriasParaObjeto`, aqui a IA pode devolver um rótulo NOVO
  // (não cadastrado em `Fornecedor.categoria`) — é o próprio objetivo da função (CLAUDE.md,
  // decisão do usuário 2026-08-24). Não deve haver filtro/allowlist nenhum.
  it("mantém uma tag inédita, sem descartar por não estar em nenhum catálogo", async () => {
    mockResposta(["bicho-da-seda"]);

    const resultado = await gerarTagCnae("Criação de bicho-da-seda");

    expect(resultado).toEqual(["bicho-da-seda"]);
  });

  it("envia a descrição do CNAE no prompt e não envia lista de categorias disponíveis", async () => {
    mockResposta(["elétrica"]);

    await gerarTagCnae("Comércio varejista de artigos de iluminação");

    const chamada = mocks.create.mock.calls[0]![0];
    expect(chamada.messages[0].content).toContain("Comércio varejista de artigos de iluminação");
    expect(chamada.response_format).toEqual({ type: "json_object" });
  });

  it("lança erro claro quando a resposta da IA não é o JSON esperado", async () => {
    mocks.create.mockResolvedValue({ choices: [{ message: { content: "não é json" } }] });

    await expect(gerarTagCnae("Cultivo de mamona")).rejects.toThrow(/gerarTagCnae/);
  });
});
