import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  PrismaClient: vi.fn(function (this: Record<string, unknown>) {
    this.empresaCandidataFornecedor = { findMany: vi.fn() };
    return this;
  }),
  PrismaPg: vi.fn(),
}));

vi.mock("@prisma/client", () => ({ PrismaClient: mocks.PrismaClient }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: mocks.PrismaPg }));

const URL_FALSA = "postgresql://u:p@localhost:5432/candidatos";

describe("cliente Prisma do banco de candidatos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete (globalThis as Record<string, unknown>).prismaCandidatos;
    // Ausente de verdade: com "" o `??` do código escolheria a string vazia e lançaria.
    delete process.env.DATABASE_CANDIDATOS_ADMIN_URL;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as Record<string, unknown>).prismaCandidatos;
  });

  it("não conecta ao ser importado, mesmo sem a variável (o build importa tudo)", async () => {
    vi.stubEnv("DATABASE_CANDIDATOS_URL", "");
    await expect(import("../dbCandidatos")).resolves.toBeDefined();
    expect(mocks.PrismaClient).not.toHaveBeenCalled();
  });

  it("falha com mensagem clara ao usar sem a variável", async () => {
    vi.stubEnv("DATABASE_CANDIDATOS_URL", "");
    const { dbCandidatos } = await import("../dbCandidatos");
    expect(() => dbCandidatos.empresaCandidataFornecedor).toThrow(/DATABASE_CANDIDATOS_URL/);
  });

  // A regressão do EMAXCONN (2026-11-23): o singleton só era guardado fora de produção, então em
  // produção cada acesso criava um PrismaClient novo com pool próprio, nunca encerrado.
  it("em PRODUÇÃO reaproveita o mesmo client entre acessos e entre usos de método", async () => {
    vi.stubEnv("DATABASE_CANDIDATOS_URL", URL_FALSA);
    vi.stubEnv("NODE_ENV", "production");
    const { dbCandidatos } = await import("../dbCandidatos");

    void dbCandidatos.empresaCandidataFornecedor;
    void dbCandidatos.empresaCandidataFornecedor;
    void (dbCandidatos as unknown as Record<string, unknown>).$queryRaw;
    void (dbCandidatos as unknown as Record<string, unknown>).$executeRaw;

    expect(mocks.PrismaClient).toHaveBeenCalledTimes(1);
    expect(mocks.PrismaPg).toHaveBeenCalledTimes(1);
  });
});
