import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    fonteReferencia: { findUnique: vi.fn() },
    loteIngestao: { create: vi.fn(), update: vi.fn() },
    precoReferencia: { createMany: vi.fn() },
  };
  return { db };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { executarIngestao, type ConfigIngestao } from "../runner";

const FONTE_ID = "fonte-1";
const LOTE_ID = "lote-1";

interface LinhaBruta {
  codigo: string;
  descricao: string;
  valor: string;
}

function configBase(overrides: Partial<ConfigIngestao<LinhaBruta>> = {}): ConfigIngestao<LinhaBruta> {
  return {
    fonteChave: "sinapi",
    competencia: "2026-08",
    baixar: vi.fn().mockResolvedValue({
      conteudo: Buffer.from("conteudo-bruto"),
      urlArquivo: "https://exemplo.gov.br/arquivo.csv",
    }),
    validarCabecalho: vi.fn().mockReturnValue({ valido: true }),
    parsearLinhas: vi.fn().mockReturnValue([
      { codigo: "001", descricao: "Item A", valor: "10.00" },
      { codigo: "002", descricao: "Item B", valor: "-5" },
    ]),
    normalizarLinha: vi.fn((linha: LinhaBruta) => {
      const valor = Number(linha.valor);
      if (valor <= 0) {
        return { ok: false as const, motivo: `Valor inválido para o código ${linha.codigo}` };
      }
      return {
        ok: true as const,
        preco: {
          codigo: linha.codigo,
          descricao: linha.descricao,
          descricaoNormalizada: linha.descricao.toLowerCase(),
          unidade: "UN",
          valorUnitario: valor,
          dataReferencia: new Date("2026-08-01"),
        },
      };
    }),
    ...overrides,
  };
}

describe("executarIngestao", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.fonteReferencia.findUnique.mockResolvedValue({ id: FONTE_ID, ativa: true });
    mocks.db.loteIngestao.create.mockResolvedValue({ id: LOTE_ID });
    mocks.db.loteIngestao.update.mockResolvedValue({});
    mocks.db.precoReferencia.createMany.mockResolvedValue({ count: 1 });
  });

  it("rejeita fonte não cadastrada sem criar lote", async () => {
    mocks.db.fonteReferencia.findUnique.mockResolvedValue(null);

    await expect(executarIngestao(configBase())).rejects.toThrow(/não cadastrada/);
    expect(mocks.db.loteIngestao.create).not.toHaveBeenCalled();
  });

  it("rejeita fonte inativa sem criar lote", async () => {
    mocks.db.fonteReferencia.findUnique.mockResolvedValue({ id: FONTE_ID, ativa: false });

    await expect(executarIngestao(configBase())).rejects.toThrow(/inativa/);
    expect(mocks.db.loteIngestao.create).not.toHaveBeenCalled();
  });

  it("falha visivelmente quando o cabeçalho não corresponde ao formato esperado", async () => {
    const config = configBase({
      validarCabecalho: vi.fn().mockReturnValue({ valido: false, motivo: "Layout inesperado" }),
    });

    const resumo = await executarIngestao(config);

    expect(resumo.sucesso).toBe(false);
    expect(resumo.erro).toBe("Layout inesperado");
    expect(resumo.linhasImportadas).toBe(0);
    expect(mocks.db.precoReferencia.createMany).not.toHaveBeenCalled();
    expect(mocks.db.loteIngestao.update).toHaveBeenCalledWith({
      where: { id: LOTE_ID },
      data: { concluidoEm: expect.any(Date), erro: "Layout inesperado" },
    });
  });

  it("grava as linhas válidas e reporta as rejeitadas", async () => {
    const resumo = await executarIngestao(configBase());

    expect(resumo).toMatchObject({
      loteId: LOTE_ID,
      sucesso: true,
      linhasLidas: 2,
      linhasImportadas: 1,
      linhasRejeitadas: 1,
      motivosRejeicao: ["Valor inválido para o código 002"],
    });

    expect(mocks.db.precoReferencia.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          fonteReferenciaId: FONTE_ID,
          loteIngestaoId: LOTE_ID,
          competencia: "2026-08",
          codigo: "001",
          valorUnitario: 10,
          uf: "",
          regime: "",
        }),
      ],
      skipDuplicates: true,
    });

    expect(mocks.db.loteIngestao.update).toHaveBeenCalledWith({
      where: { id: LOTE_ID },
      data: {
        linhasLidas: 2,
        linhasImportadas: 1,
        linhasRejeitadas: 1,
        concluidoEm: expect.any(Date),
      },
    });
  });

  it("grava o regime informado pela normalização (SINAPI: desonerado × não desonerado)", async () => {
    const config = configBase({
      parsearLinhas: vi.fn().mockReturnValue([
        { codigo: "001", descricao: "Item A", valor: "10.00" },
      ]),
      normalizarLinha: vi.fn((linha: LinhaBruta) => ({
        ok: true as const,
        preco: {
          codigo: linha.codigo,
          descricao: linha.descricao,
          descricaoNormalizada: linha.descricao.toLowerCase(),
          unidade: "UN",
          valorUnitario: Number(linha.valor),
          dataReferencia: new Date("2026-08-01"),
          regime: "desonerado",
        },
      })),
    });

    await executarIngestao(config);

    expect(mocks.db.precoReferencia.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ regime: "desonerado" })],
      skipDuplicates: true,
    });
  });

  it("reporta linhasImportadas pelo count real do createMany, não pelo total de linhas válidas", async () => {
    // 3 linhas válidas, mas o banco só grava 2 — skipDuplicates pulou 1 por
    // colidir com a constraint @@unique (ex.: reingestão da mesma competência).
    const config = configBase({
      parsearLinhas: vi.fn().mockReturnValue([
        { codigo: "001", descricao: "Item A", valor: "10.00" },
        { codigo: "002", descricao: "Item B", valor: "20.00" },
        { codigo: "003", descricao: "Item C", valor: "30.00" },
      ]),
    });
    mocks.db.precoReferencia.createMany.mockResolvedValue({ count: 2 });

    const resumo = await executarIngestao(config);

    expect(resumo.linhasImportadas).toBe(2);
    expect(resumo.linhasLidas).toBe(3);
    expect(resumo.linhasRejeitadas).toBe(0);
    expect(mocks.db.loteIngestao.update).toHaveBeenCalledWith({
      where: { id: LOTE_ID },
      data: {
        linhasLidas: 3,
        linhasImportadas: 2,
        linhasRejeitadas: 0,
        concluidoEm: expect.any(Date),
      },
    });
  });

  it("registra erro do parser sem gravar nenhuma linha", async () => {
    const config = configBase({
      parsearLinhas: vi.fn(() => {
        throw new Error("Arquivo corrompido");
      }),
    });

    const resumo = await executarIngestao(config);

    expect(resumo.sucesso).toBe(false);
    expect(resumo.erro).toBe("Arquivo corrompido");
    expect(mocks.db.precoReferencia.createMany).not.toHaveBeenCalled();
  });
});
