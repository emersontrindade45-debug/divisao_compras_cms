import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    cotacao: { findUnique: vi.fn() },
    proposta: { create: vi.fn() },
  },
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole, requireAuth: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));

import { registrarProposta } from "../cotacoes";

function propostaInput(over: Record<string, unknown> = {}) {
  return {
    cotacaoId: "ckqut11d0000abcdefghijklm",
    cnpjValido: "valido",
    descricaoValida: "valido",
    valorUnitarioValido: "valido",
    valorTotalValido: "valido",
    dataValida: "valido",
    responsavelValido: "valido",
    statusGeral: "valida",
    valorUnitario: 100,
    valorTotal: 1000,
    dataProposta: new Date().toISOString(),
    responsavel: "Fulano",
    ...over,
  };
}

describe("registrarProposta — alerta de qualificação (M19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({
      id: "user-1",
      role: "pesquisa",
      email: "u@e.com",
      name: "Usuário",
    });
    mocks.db.proposta.create.mockResolvedValue({ id: "prop-1" });
  });

  it("espelha o status de qualificação já consultado do fornecedor na proposta", async () => {
    mocks.db.cotacao.findUnique.mockResolvedValue({
      processoId: "proc-1",
      fornecedor: { statusQualificacao: "sancionado" },
    });

    await registrarProposta(propostaInput());

    expect(mocks.db.proposta.create).toHaveBeenCalledTimes(1);
    const arg = mocks.db.proposta.create.mock.calls[0]![0] as {
      data: { statusQualificacaoFornecedor: string };
    };
    expect(arg.data.statusQualificacaoFornecedor).toBe("sancionado");
  });

  it("usa select (não include) na consulta da cotação — CLAUDE.md §9.46", async () => {
    mocks.db.cotacao.findUnique.mockResolvedValue({
      processoId: "proc-1",
      fornecedor: { statusQualificacao: "regular" },
    });

    await registrarProposta(propostaInput());

    const arg = mocks.db.cotacao.findUnique.mock.calls[0]![0] as {
      select?: unknown;
      include?: unknown;
    };
    expect(arg.include).toBeUndefined();
    expect(arg.select).toBeDefined();
  });

  it("emite alerta em log quando o fornecedor está sancionado ou com cadastro irregular", async () => {
    mocks.db.cotacao.findUnique.mockResolvedValue({
      processoId: "proc-1",
      fornecedor: { statusQualificacao: "sancionado" },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await registrarProposta(propostaInput());

    expect(warnSpy).toHaveBeenCalled();
  });

  it("não emite alerta quando o fornecedor está regular", async () => {
    mocks.db.cotacao.findUnique.mockResolvedValue({
      processoId: "proc-1",
      fornecedor: { statusQualificacao: "regular" },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await registrarProposta(propostaInput());

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("grava statusQualificacaoFornecedor como null quando o fornecedor nunca foi consultado", async () => {
    mocks.db.cotacao.findUnique.mockResolvedValue({
      processoId: "proc-1",
      fornecedor: { statusQualificacao: "nao_verificado" },
    });

    await registrarProposta(propostaInput());

    const arg = mocks.db.proposta.create.mock.calls[0]![0] as {
      data: { statusQualificacaoFornecedor: string };
    };
    expect(arg.data.statusQualificacaoFornecedor).toBe("nao_verificado");
  });
});
