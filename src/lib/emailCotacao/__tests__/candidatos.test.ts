import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/dbCandidatos", () => ({ dbCandidatos: { $queryRaw: mocks.queryRaw } }));

import { buscarCandidatosPorEmail } from "../candidatos";

const linha = (email: string, cnpj: string) => ({
  email,
  cnpj,
  razaoSocial: `Empresa ${cnpj}`,
  cnaeDescricao: "Comércio",
});

describe("buscarCandidatosPorEmail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("e-mail de uma única empresa devolve os dados dela", async () => {
    mocks.queryRaw.mockResolvedValue([linha("a@x.com.br", "111")]);
    const r = await buscarCandidatosPorEmail(["A@x.com.br"]);
    expect(r.get("a@x.com.br")).toEqual({ cnpj: "111", razaoSocial: "Empresa 111", cnaeDescricao: "Comércio" });
  });

  it("e-mail compartilhado por várias empresas (contador) não escolhe nenhuma", async () => {
    mocks.queryRaw.mockResolvedValue([linha("c@contador.com.br", "111"), linha("c@contador.com.br", "222")]);
    const r = await buscarCandidatosPorEmail(["c@contador.com.br"]);
    expect(r.get("c@contador.com.br")).toEqual({ cnpj: null, razaoSocial: null, cnaeDescricao: null });
  });

  it("e-mail que não está na base não aparece no resultado", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    expect((await buscarCandidatosPorEmail(["z@z.com"])).has("z@z.com")).toBe(false);
  });

  it("deduplica e normaliza antes de consultar; lista vazia não consulta", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    await buscarCandidatosPorEmail(["A@x.com", "a@x.com", " a@x.com "]);
    expect(mocks.queryRaw.mock.calls[0]![1]).toEqual(["a@x.com"]);
    mocks.queryRaw.mockClear();
    await buscarCandidatosPorEmail([]);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("consulta em lotes de 2.000 para não estourar o limite de parâmetros", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    await buscarCandidatosPorEmail(Array.from({ length: 4500 }, (_, i) => `u${i}@x.com`));
    expect(mocks.queryRaw).toHaveBeenCalledTimes(3);
    expect((mocks.queryRaw.mock.calls[0]![1] as string[]).length).toBe(2000);
    expect((mocks.queryRaw.mock.calls[2]![1] as string[]).length).toBe(500);
  });

  it("usa a forma unnest+LATERAL com o predicado do índice parcial (não ANY, que faz Seq Scan)", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    await buscarCandidatosPorEmail(["a@x.com"]);
    const sql = (mocks.queryRaw.mock.calls[0]![0] as string[]).join("?");
    expect(sql).toContain("unnest(");
    expect(sql).toContain("CROSS JOIN LATERAL");
    expect(sql).toContain("LIMIT 2");
    expect(sql).toContain(`"email" IS NOT NULL AND "email" <> ''`);
    expect(sql).not.toMatch(/=\s*ANY\(/i);
  });
});
