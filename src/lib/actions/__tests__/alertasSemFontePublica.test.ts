import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    cotacao: { findMany: vi.fn() },
    processo: { findMany: vi.fn() },
    proposta: { findMany: vi.fn() },
    seriePreco: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ requireAuth: vi.fn().mockResolvedValue({ id: "u" }) }));

import { buscarAlertas } from "../alertas";

const semPreco = { seriePrecos: [{ precos: [] }] };
const comPrecoPublico = { seriePrecos: [{ precos: [{ id: "p" }] }] };

describe("buscarAlertas — sem fonte pública (mesma definição do card do dashboard, M30.a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.cotacao.findMany.mockResolvedValue([]);
    mocks.db.proposta.findMany.mockResolvedValue([]);
    mocks.db.seriePreco.findMany.mockResolvedValue([]);
  });

  it("consulta processos ativos e preços públicos INCLUÍDOS no PrecoConsolidado", async () => {
    mocks.db.processo.findMany.mockResolvedValue([]);
    await buscarAlertas();

    const arg = mocks.db.processo.findMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ status: { not: "aderente" }, faseAndamento: { not: "concluido" } });
    expect(arg.select.itens.select.seriePrecos.select.precos.where).toEqual({
      status: "incluido",
      fonte: "contratacao_publica",
    });
  });

  it("alerta só o processo cujos itens não têm preço público", async () => {
    mocks.db.processo.findMany.mockResolvedValue([
      { id: "a", numero: "001", itens: [semPreco, semPreco] },
      { id: "b", numero: "002", itens: [semPreco, comPrecoPublico] },
    ]);
    const alertas = await buscarAlertas();

    const sem = alertas.filter((x) => x.tipo === "processo_sem_fonte_publica");
    expect(sem.map((x) => x.mensagem)).toEqual([
      "Processo 001 não possui fonte pública registrada (exigido pela IN 65/2021).",
    ]);
  });
});
