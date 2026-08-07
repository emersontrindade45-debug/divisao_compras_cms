import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

/**
 * Mock com estado (Map) para exercitar a semântica real de `upsert`
 * (create-se-ausente / update-se-presente), não só a forma da chamada —
 * assim a "duas vezes não duplica" é uma garantia observada, não deduzida.
 */
const mocks = vi.hoisted(() => {
  const registros = new Map<string, Record<string, unknown>>();
  const upsert = vi.fn(
    async ({
      where,
      update,
      create,
    }: {
      where: { chave: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }) => {
      const existente = registros.get(where.chave);
      if (existente) {
        registros.set(where.chave, { ...existente, ...update });
      } else {
        registros.set(where.chave, { id: `id-${where.chave}`, ...create });
      }
      return { id: registros.get(where.chave)?.id };
    },
  );
  return { db: { fonteReferencia: { upsert } }, registros };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { garantirFontesCatalogoComprasGov } from "../fontesComprasGov";

describe("garantirFontesCatalogoComprasGov", () => {
  beforeEach(() => {
    mocks.registros.clear();
    mocks.db.fonteReferencia.upsert.mockClear();
  });

  it("cria as FonteReferencia catmat e catser na primeira chamada", async () => {
    await garantirFontesCatalogoComprasGov();

    expect(mocks.registros.size).toBe(2);
    expect(mocks.registros.get("catmat")).toMatchObject({
      chave: "catmat",
      esfera: "federal",
      urlOficial: "https://dadosabertos.compras.gov.br",
      ativa: true,
    });
    expect(mocks.registros.get("catser")).toMatchObject({
      chave: "catser",
      esfera: "federal",
      ativa: true,
    });
  });

  it("rodar duas vezes não duplica nem sobrescreve um campo ajustado manualmente", async () => {
    await garantirFontesCatalogoComprasGov();

    // Simula um administrador desativando "catmat" manualmente entre as duas rodadas.
    mocks.registros.set("catmat", { ...mocks.registros.get("catmat"), ativa: false });

    await garantirFontesCatalogoComprasGov();

    expect(mocks.registros.size).toBe(2); // nenhuma duplicata criada
    expect(mocks.registros.get("catmat")?.ativa).toBe(false); // não sobrescrito pelo `update: {}`
    expect(mocks.db.fonteReferencia.upsert).toHaveBeenCalledTimes(4); // 2 fontes × 2 execuções

    for (const chamada of mocks.db.fonteReferencia.upsert.mock.calls) {
      expect(chamada[0]).toMatchObject({ update: {} });
    }
  });
});
