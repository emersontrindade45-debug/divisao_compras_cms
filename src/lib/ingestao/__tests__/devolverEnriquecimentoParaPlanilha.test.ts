import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { fornecedor: { findMany: vi.fn() } },
  escreverEnriquecimentoNaPlanilha: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/sheets/escreverEnriquecimentoNaPlanilha", () => ({
  escreverEnriquecimentoNaPlanilha: mocks.escreverEnriquecimentoNaPlanilha,
}));

import { devolverEnriquecimentoParaPlanilha } from "../devolverEnriquecimentoParaPlanilha";

const FORNECEDOR_BASE = {
  origemPlanilhaLinhaId: "10",
  razaoSocial: "Empresa X",
  cidade: "Santos",
  estado: "SP",
  categoria: ["Serviços gerais"],
  email: "contato@empresax.com",
  telefone: "(13) 99999-8888",
};

describe("devolverEnriquecimentoParaPlanilha", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.escreverEnriquecimentoNaPlanilha.mockResolvedValue({
      linhasAtualizadas: 1,
      linhasNaoEncontradas: [],
      camposIgnoradosPorJaPreenchidos: 0,
    });
  });

  it("busca só fornecedor ativo com origemPlanilhaLinhaId preenchido", async () => {
    mocks.db.fornecedor.findMany.mockResolvedValue([FORNECEDOR_BASE]);

    await devolverEnriquecimentoParaPlanilha();

    expect(mocks.db.fornecedor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "ativo", origemPlanilhaLinhaId: { not: null } },
      }),
    );
  });

  it("repassa os campos do banco para o módulo de escrita, mapeando origemPlanilhaLinhaId", async () => {
    mocks.db.fornecedor.findMany.mockResolvedValue([FORNECEDOR_BASE]);

    await devolverEnriquecimentoParaPlanilha();

    expect(mocks.escreverEnriquecimentoNaPlanilha).toHaveBeenCalledWith(
      [
        {
          origemPlanilhaLinhaId: "10",
          razaoSocial: "Empresa X",
          cidade: "Santos",
          estado: "SP",
          categoria: ["Serviços gerais"],
          email: "contato@empresax.com",
          telefone: "(13) 99999-8888",
        },
      ],
      { dryRun: undefined },
    );
  });

  it("repassa --limite como take na consulta ao banco", async () => {
    mocks.db.fornecedor.findMany.mockResolvedValue([]);

    await devolverEnriquecimentoParaPlanilha({ limite: 20 });

    expect(mocks.db.fornecedor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
  });

  it("repassa dryRun ao módulo de escrita", async () => {
    mocks.db.fornecedor.findMany.mockResolvedValue([FORNECEDOR_BASE]);

    await devolverEnriquecimentoParaPlanilha({ dryRun: true });

    expect(mocks.escreverEnriquecimentoNaPlanilha).toHaveBeenCalledWith(expect.any(Array), {
      dryRun: true,
    });
  });

  it("devolve o resultado do módulo de escrita sem transformação", async () => {
    mocks.db.fornecedor.findMany.mockResolvedValue([]);
    mocks.escreverEnriquecimentoNaPlanilha.mockResolvedValue({
      linhasAtualizadas: 5,
      linhasNaoEncontradas: ["7", "8"],
      camposIgnoradosPorJaPreenchidos: 3,
    });

    const resultado = await devolverEnriquecimentoParaPlanilha();

    expect(resultado).toEqual({
      linhasAtualizadas: 5,
      linhasNaoEncontradas: ["7", "8"],
      camposIgnoradosPorJaPreenchidos: 3,
    });
  });
});
