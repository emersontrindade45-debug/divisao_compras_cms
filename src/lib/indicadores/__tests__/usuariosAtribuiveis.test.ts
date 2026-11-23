import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { user: { findMany: mocks.findMany } } }));

import { listarUsuariosAtribuiveis } from "../camadaAcao";

describe("listarUsuariosAtribuiveis", () => {
  const original = process.env.CRON_USUARIO_EMAIL;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([{ id: "u1", name: "Ana" }]);
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_USUARIO_EMAIL;
    else process.env.CRON_USUARIO_EMAIL = original;
  });

  it("exclui o usuário de SISTEMA da lista de responsáveis (argumento que chega ao Prisma, §9.99)", async () => {
    process.env.CRON_USUARIO_EMAIL = " Sistema.Verificacao@Divisao-Compras.Local ";
    const r = await listarUsuariosAtribuiveis();
    expect(r).toEqual([{ id: "u1", name: "Ana" }]);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { email: { not: "sistema.verificacao@divisao-compras.local" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  });

  it("sem usuário de sistema configurado, não filtra ninguém (e nunca devolve a lista vazia por isso)", async () => {
    delete process.env.CRON_USUARIO_EMAIL;
    await listarUsuariosAtribuiveis();
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  });
});
