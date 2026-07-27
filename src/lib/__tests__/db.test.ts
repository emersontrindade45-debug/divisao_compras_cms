import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Nem `PrismaClient` nem `PrismaPg` chegam a ser instanciados nos casos que
// importam sem tocar no client — é exatamente isso que os testes verificam.
const mocks = vi.hoisted(() => ({
  PrismaClient: vi.fn(function (this: Record<string, unknown>) {
    this.cotacao = { findMany: vi.fn() };
    return this;
  }),
  PrismaPg: vi.fn(),
}));

vi.mock("@prisma/client", () => ({ PrismaClient: mocks.PrismaClient }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: mocks.PrismaPg }));

const URL_FALSA = "postgresql://u:p@localhost:5432/teste";

describe("cliente Prisma", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // O singleton vive em globalThis fora de produção; sem limpar, um teste
    // herda o client do anterior e o isolamento se perde.
    delete (globalThis as Record<string, unknown>).prisma;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as Record<string, unknown>).prisma;
  });

  // -------------------------------------------------------------------------
  // A regressão que motivou este arquivo.
  //
  // `export const db = createPrismaClient()` conectava na avaliação do módulo:
  // bastava o Next importar uma rota para coletar metadados em build time e o
  // throw derrubava o build inteiro com "Failed to collect page data". Só
  // aparecia onde `DATABASE_URL` não existe — ou seja, em Preview, nunca em
  // Production, que é onde ninguém olhava.
  // -------------------------------------------------------------------------

  it("não conecta ao ser importado, mesmo sem DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");

    await expect(import("../db")).resolves.toBeDefined();

    expect(mocks.PrismaClient).not.toHaveBeenCalled();
    expect(mocks.PrismaPg).not.toHaveBeenCalled();
  });

  it("importa sem instanciar o client mesmo com DATABASE_URL presente", async () => {
    vi.stubEnv("DATABASE_URL", URL_FALSA);

    await import("../db");

    expect(mocks.PrismaClient).not.toHaveBeenCalled();
  });

  it("conecta no primeiro acesso a um model", async () => {
    vi.stubEnv("DATABASE_URL", URL_FALSA);
    const { db } = await import("../db");

    void db.cotacao;

    expect(mocks.PrismaClient).toHaveBeenCalledTimes(1);
    expect(mocks.PrismaPg).toHaveBeenCalledWith({ connectionString: URL_FALSA });
  });

  it("falha com mensagem clara ao usar o banco sem DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { db } = await import("../db");

    expect(() => db.cotacao).toThrow(/DATABASE_URL/);
  });

  it("reaproveita o mesmo client entre acessos", async () => {
    vi.stubEnv("DATABASE_URL", URL_FALSA);
    const { db } = await import("../db");

    void db.cotacao;
    void db.cotacao;
    void db.processo;

    expect(mocks.PrismaClient).toHaveBeenCalledTimes(1);
  });
});
