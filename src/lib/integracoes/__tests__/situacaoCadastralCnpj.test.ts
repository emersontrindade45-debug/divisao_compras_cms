import { describe, it, expect, vi, afterEach } from "vitest";
import { consultarSituacaoCadastral, consultarDadosCadastraisCnpj } from "../situacaoCadastralCnpj";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockResposta(corpo: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => corpo } as Response;
}

/**
 * Payload real da BrasilAPI (`GET /api/cnpj/v1/00000000000191`), verificado
 * por chamada HTTP direta em 2026-08-07 (CNPJ público do Banco do Brasil).
 * Reduzido aos campos usados pelo cliente.
 */
const CNPJ_ATIVO_REAL = {
  cnpj: "00000000000191",
  razao_social: "BANCO DO BRASIL SA",
  situacao_cadastral: 2,
  descricao_situacao_cadastral: "ATIVA",
  motivo_situacao_cadastral: 0,
  descricao_motivo_situacao_cadastral: "SEM MOTIVO",
  data_situacao_cadastral: "2005-11-03",
};

describe("consultarSituacaoCadastral", () => {
  it("retorna a situação cadastral de um CNPJ existente (payload confirmado contra a BrasilAPI real)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(mockResposta(CNPJ_ATIVO_REAL));

    const resultado = await consultarSituacaoCadastral("00.000.000/0001-91");

    expect(resultado).toEqual({
      encontrado: true,
      situacao: "ATIVA",
      razaoSocial: "BANCO DO BRASIL SA",
      dataSituacao: "2005-11-03",
    });
  });

  it("usa apenas dígitos na URL da consulta (sem máscara)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(mockResposta(CNPJ_ATIVO_REAL));

    await consultarSituacaoCadastral("00.000.000/0001-91");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://brasilapi.com.br/api/cnpj/v1/00000000000191",
      expect.anything(),
    );
  });

  // Regressão (M26): sem User-Agent a BrasilAPI devolve HTTP 403 (confirmado contra a API real,
  // comparando com curl) — o fetch nativo do Node não injeta esse header sozinho.
  it("envia o header User-Agent (BrasilAPI devolve 403 sem ele)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(mockResposta(CNPJ_ATIVO_REAL));

    await consultarSituacaoCadastral("00000000000191");

    const [, opcoes] = fetchSpy.mock.calls[0]!;
    expect((opcoes as RequestInit).headers).toMatchObject({ "User-Agent": expect.any(String) });
  });

  // Payload de erro confirmado contra a BrasilAPI real (CNPJ inexistente, HTTP 404).
  it("retorna 'não encontrado' para CNPJ inexistente (HTTP 404, confirmado contra a API real)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResposta(
        { message: "CNPJ 00.000.000/0000-00 não encontrado.", type: "not_found", name: "NotFoundError" },
        false,
        404,
      ),
    );

    const resultado = await consultarSituacaoCadastral("00000000000000");

    expect(resultado.encontrado).toBe(false);
  });

  it("rejeita CNPJ com formato inválido antes de consultar a rede", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    const resultado = await consultarSituacaoCadastral("123");

    expect(resultado.encontrado).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("não é uma guarda de token — funciona sem nenhuma variável de ambiente (BrasilAPI é pública)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(mockResposta(CNPJ_ATIVO_REAL));

    const resultado = await consultarSituacaoCadastral("00000000000191");

    expect(resultado.encontrado).toBe(true);
  });
});

/**
 * Payload real da BrasilAPI (`GET /api/cnpj/v1/00000000000191`), verificado por
 * chamada HTTP direta em 2026-08-19 (M26 — enriquecimento cadastral em lote).
 * Reduzido aos campos usados por `consultarDadosCadastraisCnpj`.
 */
const CNPJ_COM_DADOS_CADASTRAIS = {
  cnpj: "00000000000191",
  razao_social: "BANCO DO BRASIL SA",
  municipio: "BRASILIA",
  uf: "DF",
  cnae_fiscal_descricao: "Bancos múltiplos, com carteira comercial",
  cnaes_secundarios: [
    { codigo: 6499999, descricao: "Outras atividades de serviços financeiros não especificadas anteriormente" },
  ],
  email: null,
};

describe("consultarDadosCadastraisCnpj", () => {
  it("retorna município, UF e atividades econômicas (CNAE principal + secundários)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(mockResposta(CNPJ_COM_DADOS_CADASTRAIS));

    const resultado = await consultarDadosCadastraisCnpj("00.000.000/0001-91");

    expect(resultado).toEqual({
      encontrado: true,
      dados: {
        municipio: "BRASILIA",
        uf: "DF",
        atividadesEconomicas: [
          "Bancos múltiplos, com carteira comercial",
          "Outras atividades de serviços financeiros não especificadas anteriormente",
        ],
        email: null,
      },
    });
  });

  it("descarta CNAE secundário sem descrição, sem quebrar os demais", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResposta({
        ...CNPJ_COM_DADOS_CADASTRAIS,
        cnaes_secundarios: [{ codigo: 123, descricao: null }, ...CNPJ_COM_DADOS_CADASTRAIS.cnaes_secundarios],
      }),
    );

    const resultado = await consultarDadosCadastraisCnpj("00000000000191");

    expect(resultado.encontrado && resultado.dados.atividadesEconomicas).toEqual([
      "Bancos múltiplos, com carteira comercial",
      "Outras atividades de serviços financeiros não especificadas anteriormente",
    ]);
  });

  it("retorna 'não encontrado' para CNPJ inexistente, sem propagar exceção", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResposta({ message: "não encontrado", type: "not_found", name: "NotFoundError" }, false, 404),
    );

    const resultado = await consultarDadosCadastraisCnpj("00000000000000");

    expect(resultado.encontrado).toBe(false);
  });

  it("rejeita CNPJ com formato inválido antes de consultar a rede", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    const resultado = await consultarDadosCadastraisCnpj("123");

    expect(resultado.encontrado).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
