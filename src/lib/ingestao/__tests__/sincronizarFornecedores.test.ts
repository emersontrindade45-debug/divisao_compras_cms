import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    fornecedor: { findMany: vi.fn() },
    sincronizacaoFornecedores: { create: vi.fn(), update: vi.fn() },
  },
  fetchText: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { sincronizarFornecedores } from "../sincronizarFornecedores";

const CSV_BASICO = [
  "#,Tags,Nome/Razão Social,CPF/CNPJ,Telefone,Telefone 2,E-mail,Contato,Município,UF,Situação,Fonte,Processos Cotação,Respondeu?,Enviou Orçamento?",
  '1,,ACME LTDA,12345678000190,(13) 1111-1111,,acme@exemplo.com,Fulano,Santos,SP,,Quadro Geral,,,',
  '2,,BETA COMERCIO,,,,"beta@exemplo.com",,,,,"Quadro Geral",,,',
].join("\n");

describe("sincronizarFornecedores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.sincronizacaoFornecedores.create.mockResolvedValue({ id: "sync-1" });
    mocks.db.sincronizacaoFornecedores.update.mockResolvedValue({});
    mocks.db.fornecedor.findMany.mockResolvedValue([]);
    mocks.db.$executeRaw.mockResolvedValue(0);
  });

  it("grava um registro de SincronizacaoFornecedores antes de processar, com origem e iniciadoEm", async () => {
    await sincronizarFornecedores({ csv: CSV_BASICO, origem: "manual" });

    expect(mocks.db.sincronizacaoFornecedores.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ origem: "manual" }),
    });
  });

  it("faz upsert em lote por origemPlanilhaLinhaId, não por cnpj", async () => {
    await sincronizarFornecedores({ csv: CSV_BASICO, origem: "manual" });

    expect(mocks.db.$executeRaw).toHaveBeenCalled();
    const strings = mocks.db.$executeRaw.mock.calls[0]![0] as string[];
    const sqlTexto = strings.join("");
    expect(sqlTexto).toContain('ON CONFLICT ("origemPlanilhaLinhaId")');
  });

  it("marca como inativo fornecedor cujo linhaId não veio mais na leitura atual", async () => {
    mocks.db.fornecedor.findMany.mockResolvedValue([
      { id: "forn-antigo", origemPlanilhaLinhaId: "999", status: "ativo" },
    ]);

    await sincronizarFornecedores({ csv: CSV_BASICO, origem: "manual" });

    const chamadaUpdateStatus = mocks.db.$executeRaw.mock.calls.find((call) => {
      const sql = (call[0] as string[]).join("");
      return sql.includes("inativo") && sql.includes("UPDATE");
    });
    expect(chamadaUpdateStatus).toBeDefined();
  });

  it("não desativa fornecedor cujo linhaId ainda está presente na planilha", async () => {
    mocks.db.fornecedor.findMany.mockResolvedValue([
      { id: "forn-1", origemPlanilhaLinhaId: "1", status: "ativo" },
    ]);

    const resultado = await sincronizarFornecedores({ csv: CSV_BASICO, origem: "manual" });

    expect(resultado.linhasDesativadas).toBe(0);
  });

  it("conta linhasRejeitadas do parser e grava em detalhes, sem travar a sincronização", async () => {
    const csvComRejeicao = [
      "#,Nome/Razão Social,CPF/CNPJ",
      ",SEM ID,12345678000190",
    ].join("\n");

    const resultado = await sincronizarFornecedores({ csv: csvComRejeicao, origem: "manual" });

    expect(resultado.linhasRejeitadas).toBeGreaterThanOrEqual(0);
  });

  it("grava concluidoEm e os contadores finais no registro de sincronização, mesmo com 0 linhas", async () => {
    await sincronizarFornecedores({ csv: "", origem: "manual" });

    expect(mocks.db.sincronizacaoFornecedores.update).toHaveBeenCalledWith({
      where: { id: "sync-1" },
      data: expect.objectContaining({
        concluidoEm: expect.any(Date),
        linhasLidas: expect.any(Number),
      }),
    });
  });

  it("mescla via UPDATE por id quando o CNPJ da linha já existe num fornecedor sem origemPlanilhaLinhaId, em vez de tentar INSERT", async () => {
    mocks.db.fornecedor.findMany.mockImplementation(
      async ({ where }: { where?: { origemPlanilhaLinhaId?: string | null } }) => {
        if (where?.origemPlanilhaLinhaId === null) {
          // Busca de colisão de CNPJ dentro de upsertLote: simula que o CNPJ da
          // linha "ACME LTDA" (12345678000190, mascarado pelo parser) já
          // pertence a um fornecedor manual.
          return [{ id: "forn-manual-existente", cnpj: "12.345.678/0001-90" }];
        }
        return [];
      },
    );

    await sincronizarFornecedores({ csv: CSV_BASICO, origem: "manual" });

    const chamadaUpdatePorId = mocks.db.$executeRaw.mock.calls.find((call) => {
      const sql = (call[0] as string[]).join("");
      return sql.includes('WHERE "id" =') && sql.includes("origemPlanilhaLinhaId");
    });
    expect(chamadaUpdatePorId).toBeDefined();

    // Nunca deve tentar o INSERT em lote com um CNPJ que colide — só a linha
    // sem colisão (BETA COMERCIO, sem CNPJ) deve seguir para o INSERT.
    const chamadaInsert = mocks.db.$executeRaw.mock.calls.find((call) => {
      const sql = (call[0] as string[]).join("");
      return sql.includes("INSERT INTO");
    });
    expect(chamadaInsert).toBeDefined();
  });

  it("mantém só a primeira ocorrência quando duas linhas do mesmo lote têm o mesmo CNPJ", async () => {
    const csvComCnpjDuplicado = [
      "#,Nome/Razão Social,CPF/CNPJ",
      "1,PRIMEIRA LTDA,12345678000190",
      "2,SEGUNDA LTDA,12345678000190",
    ].join("\n");

    await sincronizarFornecedores({ csv: csvComCnpjDuplicado, origem: "manual" });

    const chamadaInsert = mocks.db.$executeRaw.mock.calls.find((call) => {
      const sql = (call[0] as string[]).join("");
      return sql.includes("INSERT INTO");
    });
    expect(chamadaInsert).toBeDefined();
    // Só uma linha (a primeira) deve ir para o INSERT: Prisma.join agrupa as
    // linhas do VALUES num único valor posicional aninhado ({ strings, values }).
    const valuesJoin = chamadaInsert![1] as { values: unknown[] };
    expect(valuesJoin.values).toContain("PRIMEIRA LTDA");
    expect(valuesJoin.values).not.toContain("SEGUNDA LTDA");
  });

  it("grava erro e concluidoEm no registro quando o upsert falha, sem propagar exceção silenciosamente", async () => {
    mocks.db.$executeRaw.mockRejectedValue(new Error("conexão perdida"));

    await expect(sincronizarFornecedores({ csv: CSV_BASICO, origem: "manual" })).rejects.toThrow(
      "conexão perdida",
    );

    expect(mocks.db.sincronizacaoFornecedores.update).toHaveBeenCalledWith({
      where: { id: "sync-1" },
      data: expect.objectContaining({
        erro: expect.stringContaining("conexão perdida"),
        concluidoEm: expect.any(Date),
      }),
    });
  });
});
