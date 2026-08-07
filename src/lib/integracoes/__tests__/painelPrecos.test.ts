import { describe, it, expect, vi } from "vitest";

// `buscarPrecosPainelPrecos` delega para `buscarContratosComprasGov`
// (comprasGov.ts), que desde o M16 consulta `ItemCatalogoReferencia` antes de
// cair no download por request (docs/ApiPlan.md §4.2). Sem este mock, o teste
// bateria no Prisma real (banco local, se houver um rodando) em vez de ficar
// isolado — mesma classe de problema da §9.42 do CLAUDE.md, agora para `db`
// em vez de dependência de pacote.
vi.mock("@/lib/db", () => ({
  db: { itemCatalogoReferencia: { findMany: vi.fn().mockResolvedValue([]) } },
}));

import { buscarPrecosPainelPrecos } from "../painelPrecos";

describe("buscarPrecosPainelPrecos", () => {
  it("retorna lista vazia (integração desativada — sem busca por texto livre na API pública)", async () => {
    const resultado = await buscarPrecosPainelPrecos("qualquer coisa");
    expect(resultado).toEqual([]);
  });
});
