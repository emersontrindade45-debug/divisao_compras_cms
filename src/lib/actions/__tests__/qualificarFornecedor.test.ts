import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    fornecedor: { findUnique: vi.fn(), update: vi.fn() },
    qualificacaoFornecedor: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  consultarSituacaoCadastral: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/integracoes/situacaoCadastralCnpj", () => ({
  consultarSituacaoCadastral: mocks.consultarSituacaoCadastral,
}));

import { qualificarFornecedor } from "../qualificarFornecedor";

const FORNECEDOR = {
  id: "forn-1",
  cnpj: "12.345.678/0001-99",
  razaoSocial: "Fornecedora Exemplo LTDA",
};

describe("qualificarFornecedor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({
      id: "user-1",
      role: "pesquisa",
      email: "u@e.com",
      name: "Usuário",
    });
    mocks.db.fornecedor.findUnique.mockResolvedValue(FORNECEDOR);
    mocks.db.$transaction.mockResolvedValue([{}, {}]);
  });

  it("retorna erro quando o fornecedor não existe", async () => {
    mocks.db.fornecedor.findUnique.mockResolvedValue(null);

    const resultado = await qualificarFornecedor("inexistente");

    expect(resultado.error).toBeTruthy();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("grava status 'cadastro_irregular' e alerta quando a situação cadastral não é ATIVA", async () => {
    mocks.consultarSituacaoCadastral.mockResolvedValue({
      encontrado: true,
      situacao: "BAIXADA",
      razaoSocial: "Fornecedora Exemplo LTDA",
      dataSituacao: "2020-01-01",
    });

    const resultado = await qualificarFornecedor("forn-1");

    expect(resultado.data?.status).toBe("cadastro_irregular");
    expect(resultado.data?.alerta).toBe(true);
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("grava a data da consulta em QualificacaoFornecedor (histórico) e atualiza o espelho em Fornecedor", async () => {
    mocks.consultarSituacaoCadastral.mockResolvedValue({
      encontrado: true,
      situacao: "ATIVA",
      razaoSocial: "Fornecedora Exemplo LTDA",
      dataSituacao: "2020-01-01",
    });

    await qualificarFornecedor("forn-1");

    const chamadasTransacao = mocks.db.$transaction.mock.calls[0]![0] as unknown[];
    expect(chamadasTransacao).toHaveLength(2);
    expect(mocks.db.qualificacaoFornecedor.create).toHaveBeenCalledTimes(1);
    const argCreate = mocks.db.qualificacaoFornecedor.create.mock.calls[0]![0] as {
      data: { dataConsulta: Date; fornecedorId: string; statusQualificacao: string };
    };
    expect(argCreate.data.fornecedorId).toBe("forn-1");
    expect(argCreate.data.dataConsulta).toBeInstanceOf(Date);
    expect(argCreate.data.statusQualificacao).toBe("regular");

    expect(mocks.db.fornecedor.update).toHaveBeenCalledTimes(1);
    const argUpdate = mocks.db.fornecedor.update.mock.calls[0]![0] as {
      where: { id: string };
      data: { statusQualificacao: string };
    };
    expect(argUpdate.where.id).toBe("forn-1");
    expect(argUpdate.data.statusQualificacao).toBe("regular");
  });

  it("grava 'nao_verificado' quando a situação cadastral não pôde ser obtida", async () => {
    mocks.consultarSituacaoCadastral.mockResolvedValue({ encontrado: false });

    const resultado = await qualificarFornecedor("forn-1");

    expect(resultado.data?.status).toBe("nao_verificado");
    expect(resultado.data?.alerta).toBe(true);
  });

  it("registra auditoria da consulta", async () => {
    mocks.consultarSituacaoCadastral.mockResolvedValue({
      encontrado: true,
      situacao: "ATIVA",
      razaoSocial: "Fornecedora Exemplo LTDA",
      dataSituacao: "2020-01-01",
    });

    await qualificarFornecedor("forn-1");

    expect(mocks.registrarAuditoria).toHaveBeenCalledTimes(1);
    const arg = mocks.registrarAuditoria.mock.calls[0]![0] as { acao: string; userId: string };
    expect(arg.acao).toBe("qualificar_fornecedor");
    expect(arg.userId).toBe("user-1");
  });
});
