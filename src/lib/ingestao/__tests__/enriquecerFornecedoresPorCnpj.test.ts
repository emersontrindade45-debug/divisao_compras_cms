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
  razaoSocial: "FORNECEDOR UM LTDA",
  cidade: "",
  estado: "",
  categoria: ["água"],
  email: "contato@forn1.com.br",
  telefone: "(13) 3222-1111",
};
const FORNECEDOR_SEM_CATEGORIA = {
  id: "forn-2",
  cnpj: "22.345.678/0001-90",
  razaoSocial: "FORNECEDOR DOIS LTDA",
  cidade: "Santos",
  estado: "SP",
  categoria: [],
  email: "contato@forn2.com.br",
  telefone: "(13) 3222-2222",
};

const DADOS_CADASTRAIS_BASE = {
  municipio: null,
  uf: null,
  atividadesEconomicas: [],
  email: null,
  telefone: null,
  razaoSocial: null,
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

  it("busca todo fornecedor ativo com CNPJ (razão social só é auditável chamando a Receita)", async () => {
    await enriquecerFornecedoresPorCnpj();

    const argumento = mocks.db.fornecedor.findMany.mock.calls[0]![0];
    expect(argumento.where).toEqual({ status: "ativo", cnpj: { not: null } });
  });

  it("preenche cidade e estado quando ambos estão vazios e a API encontra os dados, normalizando a grafia da cidade", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([FORNECEDOR_SEM_CIDADE_ESTADO])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: true,
      dados: { ...DADOS_CADASTRAIS_BASE, municipio: "SAO VICENTE", uf: "SP" },
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
      dados: { ...DADOS_CADASTRAIS_BASE, municipio: "SAO PAULO", uf: "SP" },
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
      dados: { ...DADOS_CADASTRAIS_BASE, atividadesEconomicas: ["Comércio de produtos de limpeza"] },
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

  it("preenche e-mail só quando o fornecedor está sem e-mail cadastrado, sem nunca sobrescrever", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([{ ...FORNECEDOR_SEM_CATEGORIA, email: "", categoria: ["água"] }])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: true,
      dados: { ...DADOS_CADASTRAIS_BASE, email: "contato@receita.com.br" },
    });

    const resultado = await enriquecerFornecedoresPorCnpj();

    expect(mocks.db.fornecedor.update).toHaveBeenCalledWith({
      where: { id: "forn-2" },
      data: { email: "contato@receita.com.br" },
    });
    expect(resultado.emailPreenchido).toBe(1);
  });

  it("NÃO sobrescreve e-mail já cadastrado, mesmo que a Receita traga outro valor", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([{ ...FORNECEDOR_SEM_CATEGORIA, categoria: ["água"] }])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: true,
      dados: { ...DADOS_CADASTRAIS_BASE, email: "outro@receita.com.br" },
    });

    const resultado = await enriquecerFornecedoresPorCnpj();

    expect(mocks.db.fornecedor.update).not.toHaveBeenCalled();
    expect(resultado.emailPreenchido).toBe(0);
  });

  it("preenche telefone formatado (celular, 11 dígitos) só quando o fornecedor está sem telefone", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([{ ...FORNECEDOR_SEM_CATEGORIA, telefone: null, categoria: ["água"] }])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: true,
      dados: { ...DADOS_CADASTRAIS_BASE, telefone: "13991234567" },
    });

    const resultado = await enriquecerFornecedoresPorCnpj();

    expect(mocks.db.fornecedor.update).toHaveBeenCalledWith({
      where: { id: "forn-2" },
      data: { telefone: "(13) 99123-4567" },
    });
    expect(resultado.telefonePreenchido).toBe(1);
  });

  it("formata telefone fixo (10 dígitos) corretamente", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([{ ...FORNECEDOR_SEM_CATEGORIA, telefone: null, categoria: ["água"] }])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: true,
      dados: { ...DADOS_CADASTRAIS_BASE, telefone: "6134939002" },
    });

    await enriquecerFornecedoresPorCnpj();

    expect(mocks.db.fornecedor.update).toHaveBeenCalledWith({
      where: { id: "forn-2" },
      data: { telefone: "(61) 3493-9002" },
    });
  });

  it("NÃO sobrescreve telefone já cadastrado", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([{ ...FORNECEDOR_SEM_CATEGORIA, categoria: ["água"] }])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: true,
      dados: { ...DADOS_CADASTRAIS_BASE, telefone: "13991234567" },
    });

    const resultado = await enriquecerFornecedoresPorCnpj();

    expect(mocks.db.fornecedor.update).not.toHaveBeenCalled();
    expect(resultado.telefonePreenchido).toBe(0);
  });

  it("corrige a razão social quando diverge da Receita (única exceção à regra de nunca sobrescrever)", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([{ ...FORNECEDOR_SEM_CATEGORIA, razaoSocial: "fornecedor dois", categoria: ["água"] }])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: true,
      dados: { ...DADOS_CADASTRAIS_BASE, razaoSocial: "FORNECEDOR DOIS LTDA" },
    });

    const resultado = await enriquecerFornecedoresPorCnpj();

    expect(mocks.db.fornecedor.update).toHaveBeenCalledWith({
      where: { id: "forn-2" },
      data: { razaoSocial: "FORNECEDOR DOIS LTDA" },
    });
    expect(resultado.razaoSocialCorrigida).toBe(1);
  });

  it("NÃO toca na razão social quando só difere por acento/caixa/espaçamento (mesmo valor normalizado)", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([{ ...FORNECEDOR_SEM_CATEGORIA, razaoSocial: "fornecedor  dois ltda", categoria: ["água"] }])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: true,
      dados: { ...DADOS_CADASTRAIS_BASE, razaoSocial: "FORNECEDOR DOIS LTDA" },
    });

    const resultado = await enriquecerFornecedoresPorCnpj();

    expect(mocks.db.fornecedor.update).not.toHaveBeenCalled();
    expect(resultado.razaoSocialCorrigida).toBe(0);
  });

  it("NÃO toca em cidade/estado quando só um dos dois já está preenchido", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([{ ...FORNECEDOR_SEM_CIDADE_ESTADO, cidade: "Santos", estado: "" }])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: true,
      dados: { ...DADOS_CADASTRAIS_BASE, municipio: "SANTOS", uf: "SP" },
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
      dados: { ...DADOS_CADASTRAIS_BASE, municipio: "SANTOS", uf: "SP" },
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
      return { encontrado: true, dados: { ...DADOS_CADASTRAIS_BASE, municipio: "SANTOS", uf: "SP" } };
    });

    const resultado = await enriquecerFornecedoresPorCnpj();

    expect(resultado.erros).toEqual([
      { fornecedorId: "forn-1", cnpj: FORNECEDOR_SEM_CIDADE_ESTADO.cnpj, motivo: "falha de rede simulada" },
    ]);
    expect(resultado.cidadeEstadoPreenchidos).toBe(1); // forn-3 processado normalmente
  });

  it("conta 'não encontrado na API' (404 real) sem gravar nada", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([FORNECEDOR_SEM_CIDADE_ESTADO])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: false,
      motivo: "CNPJ não encontrado na Receita Federal.",
    });

    const resultado = await enriquecerFornecedoresPorCnpj();

    expect(resultado.naoEncontradosNaApi).toBe(1);
    expect(resultado.falhaTemporaria).toBe(0);
    expect(mocks.db.fornecedor.update).not.toHaveBeenCalled();
  });

  it("distingue falha temporária (429/5xx/rede) de 'não encontrado' real, pelo motivo devolvido", async () => {
    mocks.db.fornecedor.findMany
      .mockReset()
      .mockResolvedValueOnce([FORNECEDOR_SEM_CIDADE_ESTADO])
      .mockResolvedValueOnce([{ categoria: ["água"] }]);
    mocks.consultarDadosCadastraisCnpj.mockResolvedValue({
      encontrado: false,
      motivo: "BrasilAPI respondeu HTTP 429.",
    });

    const resultado = await enriquecerFornecedoresPorCnpj();

    expect(resultado.falhaTemporaria).toBe(1);
    expect(resultado.naoEncontradosNaApi).toBe(0);
    expect(mocks.db.fornecedor.update).not.toHaveBeenCalled();
  });
});
