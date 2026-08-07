import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = { itemCatalogoReferencia: { findMany: vi.fn() } };
  return { db };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { encontrarCodigosCatalogoLocal } from "../matchingCatalogoLocal";
import { normalizar } from "../texto";

function linha(codigo: number, descricao: string) {
  return { codigo, descricaoNormalizada: normalizar(descricao) };
}

describe("encontrarCodigosCatalogoLocal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.itemCatalogoReferencia.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devolve [] sem consultar o banco quando o termo não gera token utilizável", async () => {
    const resultado = await encontrarCodigosCatalogoLocal("de a");

    expect(resultado).toEqual([]);
    expect(mocks.db.itemCatalogoReferencia.findMany).not.toHaveBeenCalled();
  });

  it("devolve [] com aviso de diagnóstico quando a query não traz nenhuma linha (tabela vazia ou sem match)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.db.itemCatalogoReferencia.findMany.mockResolvedValue([]);

    const resultado = await encontrarCodigosCatalogoLocal("cadeira escritorio giratoria");

    expect(resultado).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("consulta fonteChave=catmat, ativo=true e usa o token mais distintivo (mais longo) com take limitado", async () => {
    mocks.db.itemCatalogoReferencia.findMany.mockResolvedValue([]);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await encontrarCodigosCatalogoLocal("cadeira escritorio giratoria");

    expect(mocks.db.itemCatalogoReferencia.findMany).toHaveBeenCalledTimes(1);
    const chamada = mocks.db.itemCatalogoReferencia.findMany.mock.calls[0][0];
    expect(chamada.where.fonteChave).toBe("catmat");
    expect(chamada.where.ativo).toBe(true);
    // "escritorio" é o token mais longo entre "cadeira"/"escritorio"/"giratoria".
    expect(chamada.where.descricaoNormalizada).toEqual({
      contains: "escritorio",
      mode: "insensitive",
    });
    expect(typeof chamada.take).toBe("number");
    expect(chamada.take).toBeGreaterThan(0);
    expect(chamada.select).toEqual({ codigo: true, descricaoNormalizada: true });
  });

  it("pontua por sobreposição de tokens: match forte vem antes de match fraco, e score zero é descartado", async () => {
    mocks.db.itemCatalogoReferencia.findMany.mockResolvedValue([
      linha(1, "CADEIRA GIRATORIA ESCRITORIO COM BRACO"), // 3 tokens em comum
      linha(2, "CADEIRA PLASTICA ESCOLAR"), // 1 token em comum ("cadeira")
      linha(3, "GRAMPEADOR DE MESA"), // 0 tokens em comum
    ]);

    const resultado = await encontrarCodigosCatalogoLocal("cadeira giratoria escritorio");

    expect(resultado).toEqual([1, 2]);
  });

  it("limita a quantidade de códigos devolvidos a opcoes.maxResultados", async () => {
    mocks.db.itemCatalogoReferencia.findMany.mockResolvedValue([
      linha(1, "CADEIRA GIRATORIA ESCRITORIO"),
      linha(2, "CADEIRA GIRATORIA ESCRITORIO PRETA"),
      linha(3, "CADEIRA GIRATORIA ESCRITORIO AZUL"),
    ]);

    const resultado = await encontrarCodigosCatalogoLocal("cadeira giratoria escritorio", {
      maxResultados: 2,
    });

    expect(resultado).toHaveLength(2);
  });
});
