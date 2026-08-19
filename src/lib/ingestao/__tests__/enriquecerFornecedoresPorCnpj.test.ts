import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { fornecedor: { findMany: vi.fn(), update: vi.fn() } },
  consultarDadosCadastraisCnpj: vi.fn(),
  sugerirCategoriasParaObjeto: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/integracoes/situacaoCadastralCnpj", () => ({
  consultarDadosCadastraisCnpj: mocks.consultarDadosCadastraisCnpj,
}));
vi.mock("@/lib/ia/categorizarObjeto", () => ({
  sugerirCategoriasParaObjeto: mocks.sugerirCategoriasParaObjeto,
}));

import { enriquecerFornecedoresPorCnpj } from "../enriquecerFornecedoresPorCnpj";

const FORNECEDOR_SEM_CIDADE_ESTADO = {
  id: "forn-1",
  cnpj: "12.345.678/0001-90",
  cidade: "",
  estado: "",
  categoria: ["água"],
};
const FORNECEDOR_SEM_CATEGORIA = {
  id: "forn-2",
  cnpj: "22.345.678/0001-90",
  cidade: "Santos",
  estado: "SP",
  categoria: [],
};

describe("enriquecerFornecedoresPorCnpj", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 1ª chamada de findMany = candidatos a enriquecer; 2ª = fornecedores ativos (vocabulário de tags)
    mocks.db.fornecedor.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { categoria: ["água"] },
      { categoria: ["limpeza"] },
    ]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({ encontrado: false, motivo: "não usado" });
    mocks.sugerirCategoriasParaObjeto.mockResolvedValue([]);
  });

  it("busca só fornecedores ativos com CNPJ e (sem cidade+estado OU sem categoria)", async () => {
    await enriquecerFornecedoresPorCnpj();

    const argumento = mocks.db.fornecedor.findMany.mock.calls[0]![0];
    expect(argumento.where).toEqual({
      status: "ativo",
      cnpj: { not: null },
      OR: [{ AND: [{ cidade: "" }, { estado: "" }] }, { categoria: { isEmpty: true } }],
    });
  });

  it("preenche cidade e estado quando ambos estão vazios e a API encontra os dados, normalizando a grafia da cidade", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([FORNECEDOR_SEM_CIDADE_ESTADO])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: true,
      dados: { municipio: "SAO VICENTE", uf: "SP", atividadesEconomicas: [], email: null },
    });

    const resultado = await enriquecerFornecedoresPorCnpj();

    expect(mocks.db.fornecedor.update).toHaveBeenCalledWith({
      where: { id: "forn-1" },
      data: { cidade: "São Vicente", estado: "SP" },
    });
    expect(resultado.cidadeEstadoPreenchidos).toBe(1);
  });

  it("aplica título-caso quando o município não é uma das cidades conhecidas da Baixada Santista", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([FORNECEDOR_SEM_CIDADE_ESTADO])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: true,
      dados: { municipio: "SAO PAULO", uf: "SP", atividadesEconomicas: [], email: null },
    });

    await enriquecerFornecedoresPorCnpj();

    expect(mocks.db.fornecedor.update).toHaveBeenCalledWith({
      where: { id: "forn-1" },
      data: { cidade: "Sao Paulo", estado: "SP" },
    });
  });

  it("sugere categoria via IA quando o fornecedor não tem nenhuma, usando as atividades econômicas do CNAE", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([FORNECEDOR_SEM_CATEGORIA])
      .mockResolvedValueOnce([{ categoria: ["água"] }, { categoria: ["limpeza"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: true,
      dados: { municipio: null, uf: null, atividadesEconomicas: ["Comércio de produtos de limpeza"], email: null },
    });
    mocks.sugerirCategoriasParaObjeto.mockResolvedValue(["limpeza"]);

    const resultado = await enriquecerFornecedoresPorCnpj();

    expect(mocks.sugerirCategoriasParaObjeto).toHaveBeenCalledWith(
      "Comércio de produtos de limpeza",
      expect.arrayContaining(["água", "limpeza"]),
    );
    expect(mocks.db.fornecedor.update).toHaveBeenCalledWith({
      where: { id: "forn-2" },
      data: { categoria: ["limpeza"] },
    });
    expect(resultado.categoriaSugerida).toBe(1);
  });

  it("NÃO toca em cidade/estado quando só um dos dois já está preenchido", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([{ ...FORNECEDOR_SEM_CIDADE_ESTADO, cidade: "Santos", estado: "" }])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: true,
      dados: { municipio: "SANTOS", uf: "SP", atividadesEconomicas: [], email: null },
    });

    const resultado = await enriquecerFornecedoresPorCnpj();

    expect(mocks.db.fornecedor.update).not.toHaveBeenCalled();
    expect(resultado.semNadaParaFazer).toBe(1);
  });

  it("não grava nada em modo dry-run, mas ainda conta o que teria mudado", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([FORNECEDOR_SEM_CIDADE_ESTADO])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: true,
      dados: { municipio: "SANTOS", uf: "SP", atividadesEconomicas: [], email: null },
    });

    const resultado = await enriquecerFornecedoresPorCnpj({ dryRun: true });

    expect(mocks.db.fornecedor.update).not.toHaveBeenCalled();
    expect(resultado.cidadeEstadoPreenchidos).toBe(1);
  });

  it("registra erro por fornecedor sem interromper os demais", async () => {
    const outro = { ...FORNECEDOR_SEM_CIDADE_ESTADO, id: "forn-3", cnpj: "33.345.678/0001-90" };
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([FORNECEDOR_SEM_CIDADE_ESTADO, outro])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockImplementation(async (cnpj: string) => {
      if (cnpj === FORNECEDOR_SEM_CIDADE_ESTADO.cnpj) throw new Error("falha de rede simulada");
      return { encontrado: true, dados: { municipio: "SANTOS", uf: "SP", atividadesEconomicas: [], email: null } };
    });

    const resultado = await enriquecerFornecedoresPorCnpj();

    expect(resultado.erros).toEqual([
      { fornecedorId: "forn-1", cnpj: FORNECEDOR_SEM_CIDADE_ESTADO.cnpj, motivo: "falha de rede simulada" },
    ]);
    expect(resultado.cidadeEstadoPreenchidos).toBe(1); // forn-3 processado normalmente
  });

  it("conta 'não encontrado na API' sem gravar nada", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([FORNECEDOR_SEM_CIDADE_ESTADO])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({ encontrado: false, motivo: "CNPJ não encontrado" });

    const resultado = await enriquecerFornecedoresPorCnpj();

    expect(resultado.naoEncontradosNaApi).toBe(1);
    expect(mocks.db.fornecedor.update).not.toHaveBeenCalled();
  });
});
