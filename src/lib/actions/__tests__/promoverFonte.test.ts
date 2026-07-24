import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks hoisted para poderem ser referenciados dentro das factories de vi.mock.
const mocks = vi.hoisted(() => {
  const tx = {
    fonte: { create: vi.fn() },
    evidencia: { create: vi.fn() },
    seriePreco: { findFirst: vi.fn(), create: vi.fn() },
    precoConsolidado: { create: vi.fn() },
    resultadoSimilaridade: { updateMany: vi.fn() },
  };
  const db = {
    resultadoSimilaridade: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    tx,
    db,
    requireRole: vi.fn(),
    registrarAuditoria: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { Prisma } from "@prisma/client";
import { promoverResultadoSimilaridade } from "../promoverFonte";

const RESULTADO_ID = "ckqut11d0000abcdefghijklm";

function resultadoBase(overrides: Record<string, unknown> = {}) {
  return {
    id: RESULTADO_ID,
    tipoCandidato: "contratacao_publica",
    fonteDescricao: "Aquisição de cadeiras ergonômicas",
    fonteOrgaoOuId: "Prefeitura de Exemplo",
    fonteUrl: "https://pncp.gov.br/app/contrato/123",
    valorUnitario: 850.5,
    dataReferencia: new Date("2026-01-10"),
    scoreFinal: 82,
    justificativa: "Objeto e especificações muito próximos",
    promovidoParaFonte: false,
    item: { id: "item-1", processoId: "proc-1" },
    ...overrides,
  };
}

describe("promoverResultadoSimilaridade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({
      id: "user-1",
      role: "pesquisa",
      email: "u@e.com",
      name: "Usuário",
    });
    mocks.db.$transaction.mockImplementation(async (fn: (t: typeof mocks.tx) => unknown) =>
      fn(mocks.tx),
    );
    mocks.tx.fonte.create.mockResolvedValue({ id: "fonte-1" });
    mocks.tx.evidencia.create.mockResolvedValue({ id: "ev-1" });
    mocks.tx.seriePreco.findFirst.mockResolvedValue(null);
    mocks.tx.seriePreco.create.mockResolvedValue({ id: "serie-nova" });
    mocks.tx.precoConsolidado.create.mockResolvedValue({ id: "preco-1" });
    mocks.tx.resultadoSimilaridade.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(resultadoBase());
  });

  it("cria Fonte e Evidencia atomicamente na mesma transação", async () => {
    const res = await promoverResultadoSimilaridade(RESULTADO_ID);

    expect(res.data).toEqual({ fonteId: "fonte-1" });
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.fonte.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        itemId: "item-1",
        tipo: "contratacao_publica",
        descricao: "Aquisição de cadeiras ergonômicas",
        orgaoOuFornecedor: "Prefeitura de Exemplo",
        valorUnitario: 850.5,
        // Vínculo @unique com o candidato de origem (backstop de banco).
        resultadoSimilaridadeId: RESULTADO_ID,
      }),
    });
    expect(mocks.tx.evidencia.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fonteId: "fonte-1",
        url: "https://pncp.gov.br/app/contrato/123",
        descricao: expect.stringContaining("82"),
      }),
    });
    // A descrição da evidência carrega a justificativa (rastreabilidade).
    const evidArg = mocks.tx.evidencia.create.mock.calls[0]![0] as {
      data: { descricao: string };
    };
    expect(evidArg.data.descricao).toContain("Objeto e especificações muito próximos");
  });

  it("cria uma nova série zerada quando o item ainda não tem série", async () => {
    mocks.tx.seriePreco.findFirst.mockResolvedValue(null);

    await promoverResultadoSimilaridade(RESULTADO_ID);

    expect(mocks.tx.seriePreco.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        itemId: "item-1",
        metodo: "media",
        valorEstimado: 0,
        media: 0,
        mediana: 0,
        menorValor: 0,
        coeficienteVariacao: 0,
        totalPrecos: 0,
        precosIncluidos: 0,
      }),
    });
    expect(mocks.tx.precoConsolidado.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ seriePrecoId: "serie-nova" }),
    });
  });

  it("reaproveita a série existente do item, sem criar outra", async () => {
    mocks.tx.seriePreco.findFirst.mockResolvedValue({ id: "serie-existente" });

    await promoverResultadoSimilaridade(RESULTADO_ID);

    expect(mocks.tx.seriePreco.create).not.toHaveBeenCalled();
    expect(mocks.tx.precoConsolidado.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ seriePrecoId: "serie-existente" }),
    });
  });

  it("cria o PrecoConsolidado espelhando a fonte mapeada", async () => {
    await promoverResultadoSimilaridade(RESULTADO_ID);

    expect(mocks.tx.precoConsolidado.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fonte: "contratacao_publica",
        descricaoFonte: "Aquisição de cadeiras ergonômicas",
        fornecedorOuOrgao: "Prefeitura de Exemplo",
        valorUnitario: 850.5,
      }),
    });
  });

  it("marca o candidato como promovido com guarda atômica (updateMany condicional)", async () => {
    await promoverResultadoSimilaridade(RESULTADO_ID);

    // A guarda contra corrida exige `promovidoParaFonte: false` no where — só
    // afeta a linha se nenhuma transação concorrente a promoveu antes.
    expect(mocks.tx.resultadoSimilaridade.updateMany).toHaveBeenCalledWith({
      where: { id: RESULTADO_ID, promovidoParaFonte: false },
      data: { promovidoParaFonte: true },
    });
  });

  it("aborta (rollback) e não audita quando outra transação promoveu antes (count === 0)", async () => {
    // Corrida: a checagem inicial passou, mas o updateMany não encontra a linha
    // ainda não promovida — sinal de promoção concorrente. Deve reverter tudo.
    mocks.tx.resultadoSimilaridade.updateMany.mockResolvedValue({ count: 0 });

    const res = await promoverResultadoSimilaridade(RESULTADO_ID);

    expect(res.error).toBe("Este candidato já foi promovido");
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("trata P2002 (constraint @unique) como promoção concorrente, sem vazar erro cru", async () => {
    // Backstop de banco: se duas transações escaparem da guarda atômica, o
    // insert da segunda viola o @unique de resultadoSimilaridadeId (P2002).
    mocks.tx.fonte.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const res = await promoverResultadoSimilaridade(RESULTADO_ID);

    expect(res.error).toBe("Este candidato já foi promovido");
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("registra auditoria da promoção", async () => {
    await promoverResultadoSimilaridade(RESULTADO_ID);

    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        processoId: "proc-1",
        acao: "promover_resultado_similaridade",
        detalhes: expect.objectContaining({
          resultadoId: RESULTADO_ID,
          fonteId: "fonte-1",
          itemId: "item-1",
        }),
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/processos/proc-1");
  });

  it("retorna erro e não abre transação quando já foi promovido", async () => {
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(
      resultadoBase({ promovidoParaFonte: true }),
    );

    const res = await promoverResultadoSimilaridade(RESULTADO_ID);

    expect(res.error).toBe("Este candidato já foi promovido");
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("retorna erro quando o candidato não existe", async () => {
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(null);

    const res = await promoverResultadoSimilaridade(RESULTADO_ID);

    expect(res.error).toBe("Candidato não encontrado");
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
});
