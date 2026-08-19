import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { fornecedor: { findMany: vi.fn() } },
  requireAuth: vi.fn(),
  sugerirCategoriasParaObjeto: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ requireAuth: mocks.requireAuth, requireRole: vi.fn() }));
vi.mock("@/lib/ia/categorizarObjeto", () => ({
  sugerirCategoriasParaObjeto: mocks.sugerirCategoriasParaObjeto,
}));

import { sugerirFornecedoresPorObjeto } from "../fornecedores";

const FORNECEDOR_AGUA = {
  id: "forn-agua",
  razaoSocial: "Água Boa Ltda",
  email: "contato@aguaboa.com.br",
  cidade: "Santos",
  estado: "SP",
  categoria: ["água"],
  score: 80,
};
const FORNECEDOR_LIMPEZA = {
  id: "forn-limpeza",
  razaoSocial: "Limpa Tudo Ltda",
  email: "contato@limpatudo.com.br",
  cidade: "Santos",
  estado: "SP",
  categoria: ["limpeza"],
  score: 60,
};
const FORNECEDOR_MULTI = {
  id: "forn-multi",
  razaoSocial: "Multi Serviços Ltda",
  email: "contato@multi.com.br",
  cidade: "Santos",
  estado: "SP",
  categoria: ["água", "limpeza"],
  score: 90,
};

describe("sugerirFornecedoresPorObjeto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-1", role: "pesquisa" });
    mocks.db.fornecedor.findMany.mockResolvedValue([
      FORNECEDOR_AGUA,
      FORNECEDOR_LIMPEZA,
      FORNECEDOR_MULTI,
    ]);
  });

  it("retorna vazio sem chamar a IA quando o objeto é vazio", async () => {
    const resultado = await sugerirFornecedoresPorObjeto("   ");

    expect(resultado).toEqual({ categoriasSugeridas: [], fornecedores: [] });
    expect(mocks.sugerirCategoriasParaObjeto).not.toHaveBeenCalled();
  });

  it("passa as categorias reais dos fornecedores ativos para a IA (sem duplicar)", async () => {
    mocks.sugerirCategoriasParaObjeto.mockResolvedValue([]);

    await sugerirFornecedoresPorObjeto("Aquisição de água mineral");

    const categoriasEnviadas = mocks.sugerirCategoriasParaObjeto.mock.calls[0]![1] as string[];
    expect(new Set(categoriasEnviadas)).toEqual(new Set(["água", "limpeza"]));
  });

  it("retorna os fornecedores da categoria sugerida", async () => {
    mocks.sugerirCategoriasParaObjeto.mockResolvedValue(["água"]);

    const resultado = await sugerirFornecedoresPorObjeto("Aquisição de água mineral");

    expect(resultado.categoriasSugeridas).toEqual(["água"]);
    expect(resultado.fornecedores.map((f) => f.id).sort()).toEqual(["forn-agua", "forn-multi"]);
  });

  it("une fornecedores de mais de uma categoria sugerida sem duplicar quem está nas duas", async () => {
    mocks.sugerirCategoriasParaObjeto.mockResolvedValue(["água", "limpeza"]);

    const resultado = await sugerirFornecedoresPorObjeto("Reforma com limpeza pós-obra e água");

    // forn-multi tem as duas categorias — deve aparecer só 1 vez, não 2.
    const ids = resultado.fornecedores.map((f) => f.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids)).toEqual(new Set(["forn-agua", "forn-limpeza", "forn-multi"]));
  });

  it("ordena por score decrescente", async () => {
    mocks.sugerirCategoriasParaObjeto.mockResolvedValue(["água", "limpeza"]);

    const resultado = await sugerirFornecedoresPorObjeto("Reforma com limpeza pós-obra e água");

    const scores = resultado.fornecedores.map((f) => f.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("retorna vazio quando a IA não sugere nenhuma categoria pertinente", async () => {
    mocks.sugerirCategoriasParaObjeto.mockResolvedValue([]);

    const resultado = await sugerirFornecedoresPorObjeto("Objeto sem categoria correspondente");

    expect(resultado).toEqual({ categoriasSugeridas: [], fornecedores: [] });
  });
});
