import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    precoReferencia: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { buscarCandidatosSinapi } from "../provedorSinapi";

const LINHA_BASE = {
  id: "1",
  codigo: "97141",
  descricao: "ASSENTAMENTO DE TUBO DE FERRO FUNDIDO PARA REDE DE ÁGUA, DN 80 MM",
  descricaoNormalizada: "assentamento de tubo de ferro fundido para rede de agua, dn 80 mm",
  unidade: "M",
  valorUnitario: { toNumber: () => 5.4 },
  dataReferencia: new Date("2024-12-01T00:00:00Z"),
  competencia: "2024-12",
  uf: "SP",
  regime: "nao_desonerado",
  urlEvidencia: "https://www.caixa.gov.br/site/Paginas/downloads.aspx",
  metadados: { descricaoClasse: "ASSENTAMENTO DE TUBOS E PECAS", localidade: "SAO PAULO" },
};

describe("buscarCandidatosSinapi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devolve [] sem consultar o banco quando o termo não gera token utilizável", async () => {
    const resultado = await buscarCandidatosSinapi("  ");
    expect(resultado).toEqual([]);
    expect(mocks.db.precoReferencia.findMany).not.toHaveBeenCalled();
  });

  it("devolve [] quando a query não traz nenhuma linha (tabela vazia ou sem correspondência)", async () => {
    mocks.db.precoReferencia.findMany.mockResolvedValue([]);

    const resultado = await buscarCandidatosSinapi("assentamento de tubo");

    expect(resultado).toEqual([]);
  });

  it("mapeia uma linha encontrada para CandidatoSimilaridade com tipoCandidato preco_referencia", async () => {
    mocks.db.precoReferencia.findMany.mockResolvedValue([LINHA_BASE]);

    const resultado = await buscarCandidatosSinapi("assentamento de tubo ferro fundido agua");

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      tipoCandidato: "preco_referencia",
      fonteDescricao: LINHA_BASE.descricao,
      valorUnitario: 5.4,
      unidade: "M",
      dataReferencia: LINHA_BASE.dataReferencia,
      fonteUrl: LINHA_BASE.urlEvidencia,
    });
  });

  it("descarta linhas cuja sobreposição de tokens com o termo é zero", async () => {
    mocks.db.precoReferencia.findMany.mockResolvedValue([
      { ...LINHA_BASE, descricaoNormalizada: "produto completamente nao relacionado xyz" },
    ]);

    const resultado = await buscarCandidatosSinapi("assentamento de tubo ferro fundido agua");

    expect(resultado).toEqual([]);
  });

  it("consulta só linhas ativas (fonteReferencia.chave = sinapi) e usa o token mais distintivo", async () => {
    mocks.db.precoReferencia.findMany.mockResolvedValue([]);

    await buscarCandidatosSinapi("assentamento de tubo");

    expect(mocks.db.precoReferencia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          fonteReferencia: { chave: "sinapi" },
        }),
      }),
    );
  });

  it("não vaza URL nem candidato sem urlEvidencia (CLAUDE.md §9.8 — evidência obrigatória)", async () => {
    mocks.db.precoReferencia.findMany.mockResolvedValue([
      { ...LINHA_BASE, urlEvidencia: null },
    ]);

    const resultado = await buscarCandidatosSinapi("assentamento de tubo ferro fundido agua");

    expect(resultado).toEqual([]);
  });

  it("não derruba a busca quando o banco lança exceção — devolve [] e loga", async () => {
    mocks.db.precoReferencia.findMany.mockRejectedValue(new Error("conexão perdida"));

    const resultado = await buscarCandidatosSinapi("assentamento de tubo");

    expect(resultado).toEqual([]);
  });
});
