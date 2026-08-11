import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

// Sem este mock, o banco vazio (findMany: []) aciona o fallback
// `baixarCatalogoServicosPorRequest`, que faz fetch real para
// dadosabertos.compras.gov.br — confirmado: o teste levava 2,8–3,2s e emitia
// "[ComprasGov] ItemCatalogoReferencia vazia para catser — usando fallback por
// request". Simula API devolvendo catálogo vazio, o que é o estado esperado
// neste ambiente de teste (sem ingestão rodada).
beforeEach(() => {
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      resultado: [],
      totalRegistros: 0,
      totalPaginas: 1,
      paginasRestantes: 0,
    }),
  } as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buscarPrecosPainelPrecos", () => {
  it("retorna lista vazia (integração desativada — sem busca por texto livre na API pública)", async () => {
    const resultado = await buscarPrecosPainelPrecos("qualquer coisa");
    expect(resultado).toEqual([]);
  });
});
