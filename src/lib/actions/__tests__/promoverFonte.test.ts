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

  // Regressão de deploy (CLAUDE.md §9.19): código e migration sobem em tempos
  // diferentes. Com `include` em vez de `select`, o Prisma pede todas as colunas
  // escalares — inclusive as que o M13 acrescentou — e a action quebra em runtime
  // enquanto a migration não foi aplicada. Aconteceu em produção em 2026-07-27.
  it("consulta apenas as colunas que usa, sem as acrescentadas pelo M13", async () => {
    await promoverResultadoSimilaridade(RESULTADO_ID);

    const argumento = mocks.db.resultadoSimilaridade.findUnique.mock.calls[0]![0] as {
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    };

    // `include` traria todos os escalares de volta — é o modo de falha original.
    expect(argumento.include).toBeUndefined();
    expect(argumento.select).toBeDefined();

    const colunasDoM13 = ["origem", "conversaId", "termoBuscaUsado"];
    for (const coluna of colunasDoM13) {
      expect(argumento.select).not.toHaveProperty(coluna);
    }

    // E o que a action realmente lê continua sendo pedido.
    for (const coluna of [
      "tipoCandidato",
      "fonteDescricao",
      "fonteOrgaoOuId",
      "valorUnitario",
      "dataReferencia",
      "scoreFinal",
      "justificativa",
      "promovidoParaFonte",
    ]) {
      expect(argumento.select).toHaveProperty(coluna, true);
    }
  });

  // Conformidade IN 65/2021 (CLAUDE.md §8 — bypass de conformidade é bloqueado):
  // um achado na web aberta pelo assistente (M13) não pode virar Fonte por este
  // caminho, porque a Evidencia sairia com `dataHoraAcesso` do instante da
  // promoção em vez do acesso real à página. O caminho válido é a captura pelo
  // módulo de Sites.
  it("recusa promover candidato de site eletrônico e não escreve nada", async () => {
    mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(
      resultadoBase({ tipoCandidato: "site_eletronico" }),
    );

    const res = await promoverResultadoSimilaridade(RESULTADO_ID);

    expect(res.data).toBeUndefined();
    expect(res.error).toMatch(/data e hora/i);
    // A recusa precisa acontecer ANTES de qualquer escrita: nem a transação abre.
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.fonte.create).not.toHaveBeenCalled();
    expect(mocks.tx.evidencia.create).not.toHaveBeenCalled();
    expect(mocks.tx.precoConsolidado.create).not.toHaveBeenCalled();
    expect(mocks.tx.resultadoSimilaridade.updateMany).not.toHaveBeenCalled();
    // Nada aconteceu, então não há o que auditar.
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
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

  // M20: o PNCP publica com frequência o valor cheio do contrato como se fosse
  // unitário. Promover o número cru depois de o analista ter corrigido a conta
  // colocaria o valor errado na série — que é justamente o erro que o ajuste
  // existe para evitar.
  describe("com valor ajustado pelo analista", () => {
    const AJUSTADO = { valorConsiderado: 100, ajusteUnidadeMedida: "m²" };

    it("promove o valor ajustado, não o publicado pela fonte", async () => {
      mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(
        resultadoBase({ valorUnitario: 15000, ...AJUSTADO }),
      );

      await promoverResultadoSimilaridade(RESULTADO_ID);

      expect(mocks.tx.fonte.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ valorUnitario: 100 }),
      });
      expect(mocks.tx.precoConsolidado.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ valorUnitario: 100 }),
      });
    });

    it("registra o ajuste na descrição da evidência, com o valor original", async () => {
      mocks.db.resultadoSimilaridade.findUnique.mockResolvedValue(
        resultadoBase({ valorUnitario: 15000, ...AJUSTADO }),
      );

      await promoverResultadoSimilaridade(RESULTADO_ID);

      const evidArg = mocks.tx.evidencia.create.mock.calls[0]![0] as {
        data: { descricao: string };
      };
      expect(evidArg.data.descricao).toContain("R$ 100.00");
      expect(evidArg.data.descricao).toContain("15000.00");
      expect(evidArg.data.descricao).toContain("m²");
    });

    it("mantém o valor da fonte quando não há ajuste", async () => {
      await promoverResultadoSimilaridade(RESULTADO_ID);

      expect(mocks.tx.fonte.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ valorUnitario: 850.5 }),
      });
      const evidArg = mocks.tx.evidencia.create.mock.calls[0]![0] as {
        data: { descricao: string };
      };
      expect(evidArg.data.descricao).not.toContain("ajustado pelo analista");
    });

    // Sem o vínculo, um ajuste posterior não alcançaria a linha da série.
    it("vincula o PrecoConsolidado ao candidato de origem", async () => {
      await promoverResultadoSimilaridade(RESULTADO_ID);

      expect(mocks.tx.precoConsolidado.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ resultadoSimilaridadeId: RESULTADO_ID }),
      });
    });
  });
});
