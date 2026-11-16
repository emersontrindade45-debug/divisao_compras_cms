import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    respostaEmailPendente: { findUnique: vi.fn(), updateMany: vi.fn() },
    consultaCotacao: { findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { resolverRespostaEmail } from "../resolverRespostaEmail";

const ID = "ckqut11d0000abcdefghijklm";
const DATA = new Date("2026-11-17T10:00:00.000Z");
const PENDENTE = {
  id: ID,
  envioId: "E1",
  gmailMensagemId: "m1",
  dataResposta: DATA,
  sugestaoConsultaId: "c1",
  resolvidaEm: null,
};

describe("resolverRespostaEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "u1", role: "pesquisa", name: "U", email: "u@e.com" });
    mocks.db.respostaEmailPendente.findUnique.mockResolvedValue(PENDENTE);
    mocks.db.respostaEmailPendente.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.consultaCotacao.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.$transaction.mockImplementation(async (fn: (tx: typeof mocks.db) => unknown) => fn(mocks.db));
  });

  it("orçamento: classifica a consulta sugerida como manual, só se ainda não resolvida", async () => {
    const r = await resolverRespostaEmail({ id: ID, desfecho: "orcamento" });

    expect(r.data).toEqual({ consultaJaClassificada: false });
    expect(mocks.db.respostaEmailPendente.updateMany).toHaveBeenCalledWith({
      where: { id: ID, resolvidaEm: null },
      data: { resolvidaEm: expect.any(Date) },
    });
    expect(mocks.db.consultaCotacao.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", situacao: { in: ["sem_resposta", "a_confirmar"] } },
      data: { situacao: "orcamento", regra: "manual", gmailRespostaId: "m1" },
    });
    // A data de resposta é a do e-mail, e só entra se a consulta ainda não tinha uma.
    expect(mocks.db.consultaCotacao.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", dataResposta: null },
      data: { dataResposta: DATA },
    });
  });

  it("sem sugestão, exige o e-mail ao qual a solicitação foi enviada", async () => {
    mocks.db.respostaEmailPendente.findUnique.mockResolvedValue({ ...PENDENTE, sugestaoConsultaId: null });
    const r = await resolverRespostaEmail({ id: ID, desfecho: "recusa" });
    expect(r.error).toMatch(/Informe o e-mail/);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("o e-mail digitado precisa ser de um fornecedor consultado NESTE envio", async () => {
    mocks.db.respostaEmailPendente.findUnique.mockResolvedValue({ ...PENDENTE, sugestaoConsultaId: null });
    mocks.db.consultaCotacao.findUnique.mockResolvedValue(null);
    const r = await resolverRespostaEmail({ id: ID, desfecho: "recusa", emailConsulta: "Fulano@X.com" });

    expect(r.error).toMatch(/não está entre os fornecedores/);
    expect(mocks.db.consultaCotacao.findUnique).toHaveBeenCalledWith({
      where: { envioId_email: { envioId: "E1", email: "fulano@x.com" } },
      select: { id: true },
    });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("o e-mail digitado corrige a sugestão por domínio", async () => {
    mocks.db.consultaCotacao.findUnique.mockResolvedValue({ id: "c9" });
    await resolverRespostaEmail({ id: ID, desfecho: "orcamento", emailConsulta: "outro@x.com" });
    expect(mocks.db.consultaCotacao.updateMany.mock.calls[0]![0].where.id).toBe("c9");
  });

  it("dois cliques simultâneos: o segundo perde a guarda e nada é gravado na consulta", async () => {
    mocks.db.respostaEmailPendente.updateMany.mockResolvedValue({ count: 0 });
    const r = await resolverRespostaEmail({ id: ID, desfecho: "orcamento" });
    expect(r.error).toMatch(/já foi resolvida/);
    expect(mocks.db.consultaCotacao.updateMany).not.toHaveBeenCalled();
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("resposta já resolvida não é reprocessada", async () => {
    mocks.db.respostaEmailPendente.findUnique.mockResolvedValue({ ...PENDENTE, resolvidaEm: DATA });
    expect((await resolverRespostaEmail({ id: ID, desfecho: "orcamento" })).error).toMatch(/já foi resolvida/);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("consulta que já tinha classificação segura é mantida e o analista é avisado", async () => {
    mocks.db.consultaCotacao.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    const r = await resolverRespostaEmail({ id: ID, desfecho: "recusa" });
    expect(r.data).toEqual({ consultaJaClassificada: true });
  });

  it("'não é resposta' devolve a consulta a 'sem resposta' só se foi ESTA mensagem que a deixou a confirmar", async () => {
    const r = await resolverRespostaEmail({ id: ID, desfecho: "nao_e_resposta" });

    expect(r.data).toEqual({ consultaJaClassificada: false });
    expect(mocks.db.consultaCotacao.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", situacao: "a_confirmar", gmailRespostaId: "m1" },
      data: { situacao: "sem_resposta", dataResposta: null, gmailRespostaId: null, regra: null },
    });
  });

  it("a auditoria guarda só ids, nunca endereços", async () => {
    mocks.db.consultaCotacao.findUnique.mockResolvedValue({ id: "c9" });
    await resolverRespostaEmail({ id: ID, desfecho: "orcamento", emailConsulta: "fulano@x.com" });
    expect(mocks.registrarAuditoria).toHaveBeenCalledWith({
      userId: "u1",
      acao: "resolver_resposta_email",
      detalhes: { pendenteId: ID, consultaId: "c9", desfecho: "orcamento" },
    });
    expect(JSON.stringify(mocks.registrarAuditoria.mock.calls)).not.toContain("fulano@x.com");
  });

  it("recusa entrada inválida", async () => {
    expect((await resolverRespostaEmail({ id: "x", desfecho: "orcamento" })).error).toBe("Dados inválidos.");
    expect((await resolverRespostaEmail({ id: ID, desfecho: "qualquer" })).error).toBe("Dados inválidos.");
  });
});
