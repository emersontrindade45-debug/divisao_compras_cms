import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    instrucaoPesquisa: { findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  },
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { desativarInstrucao, salvarInstrucao } from "../instrucoesPesquisa";
import { LIMITE_CARACTERES_INSTRUCAO } from "@/lib/assistente/instrucoes";

const PROCESSO_ID = "ckqut11d0000abcdefghijklm";
const INSTRUCAO_ID = "ckqut22d0000abcdefghijklm";

describe("salvarInstrucao", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "user-1", role: "revisao", name: "Revisor" });
    mocks.db.instrucaoPesquisa.upsert.mockResolvedValue({ id: INSTRUCAO_ID, versao: 2 });
  });

  // Quem edita aqui muda o critério de similaridade de TODOS os processos: o
  // texto entra no prompt de toda busca e de todo ranking.
  it("exige papel de revisão", async () => {
    await salvarInstrucao({ escopo: "global", conteudo: "regra" });

    expect(mocks.requireRole).toHaveBeenCalledWith("revisao");
  });

  it("grava a instrução global sob a chave 'global'", async () => {
    const res = await salvarInstrucao({ escopo: "global", conteudo: "Prefira o termo comercial." });

    expect(res.error).toBeUndefined();
    const args = mocks.db.instrucaoPesquisa.upsert.mock.calls[0]![0];
    expect(args.where).toEqual({ chave: "global" });
    expect(args.create.conteudo).toBe("Prefira o termo comercial.");
    expect(args.create.categoria).toBeNull();
    expect(args.create.processoId).toBeNull();
  });

  it("normaliza a chave de categoria para minúsculas", async () => {
    await salvarInstrucao({ escopo: "categoria", categoria: "Mobiliário", conteudo: "x" });

    const args = mocks.db.instrucaoPesquisa.upsert.mock.calls[0]![0];
    expect(args.where).toEqual({ chave: "categoria:mobiliário" });
    // O nome exibido preserva a caixa que o servidor digitou.
    expect(args.create.categoria).toBe("Mobiliário");
  });

  it("grava a instrução de processo sob a chave do processo", async () => {
    await salvarInstrucao({ escopo: "processo", processoId: PROCESSO_ID, conteudo: "x" });

    const args = mocks.db.instrucaoPesquisa.upsert.mock.calls[0]![0];
    expect(args.where).toEqual({ chave: `processo:${PROCESSO_ID}` });
  });

  // `upsert` sobre a chave @unique, e não busca-depois-grava: duas requisições
  // simultâneas não podem criar dois registros globais (CLAUDE.md §9.14).
  it("usa upsert atômico e incrementa a versão no update", async () => {
    await salvarInstrucao({ escopo: "global", conteudo: "x" });

    const args = mocks.db.instrucaoPesquisa.upsert.mock.calls[0]![0];
    expect(args.update.versao).toEqual({ increment: 1 });
    expect(mocks.db.instrucaoPesquisa.findMany).not.toHaveBeenCalled();
  });

  it("recusa instrução de categoria sem categoria", async () => {
    const res = await salvarInstrucao({ escopo: "categoria", conteudo: "x" });

    expect(res.error).toMatch(/categoria/i);
    expect(mocks.db.instrucaoPesquisa.upsert).not.toHaveBeenCalled();
  });

  it("recusa instrução de processo sem processo", async () => {
    const res = await salvarInstrucao({ escopo: "processo", conteudo: "x" });

    expect(res.error).toMatch(/processo/i);
    expect(mocks.db.instrucaoPesquisa.upsert).not.toHaveBeenCalled();
  });

  // O teto existe por custo: o texto entra no prompt de cada candidato avaliado.
  it("recusa texto acima do limite de caracteres", async () => {
    const res = await salvarInstrucao({
      escopo: "global",
      conteudo: "a".repeat(LIMITE_CARACTERES_INSTRUCAO + 1),
    });

    expect(res.error).toBeTruthy();
    expect(mocks.db.instrucaoPesquisa.upsert).not.toHaveBeenCalled();
  });

  it("aceita texto exatamente no limite", async () => {
    const res = await salvarInstrucao({
      escopo: "global",
      conteudo: "a".repeat(LIMITE_CARACTERES_INSTRUCAO),
    });

    expect(res.error).toBeUndefined();
  });

  it("audita a edição com a chave e a versão resultante", async () => {
    await salvarInstrucao({ escopo: "global", conteudo: "regra nova" });

    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        acao: "salvar_instrucao_pesquisa",
        detalhes: expect.objectContaining({ chave: "global", versao: 2 }),
      }),
    );
  });

  it("revalida a página de instruções", async () => {
    await salvarInstrucao({ escopo: "global", conteudo: "x" });

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/assistente/instrucoes");
  });
});

describe("desativarInstrucao", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "user-1", role: "revisao", name: "Revisor" });
    mocks.db.instrucaoPesquisa.updateMany.mockResolvedValue({ count: 1 });
  });

  // Apagar o texto deixaria o histórico sem como explicar por que um candidato
  // antigo foi pontuado como foi.
  it("desativa em vez de apagar", async () => {
    const res = await desativarInstrucao(INSTRUCAO_ID);

    expect(res.error).toBeUndefined();
    expect(mocks.db.instrucaoPesquisa.updateMany).toHaveBeenCalledWith({
      where: { id: INSTRUCAO_ID, ativo: true },
      data: { ativo: false, atualizadoPorId: "user-1" },
    });
  });

  it("trata desativação concorrente sem erro cru (count === 0)", async () => {
    mocks.db.instrucaoPesquisa.updateMany.mockResolvedValue({ count: 0 });

    const res = await desativarInstrucao(INSTRUCAO_ID);

    expect(res.error).toMatch(/não encontrada|já desativada/i);
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("recusa id inválido antes de tocar no banco", async () => {
    const res = await desativarInstrucao("nao-e-cuid");

    expect(res.error).toBe("Instrução inválida");
    expect(mocks.db.instrucaoPesquisa.updateMany).not.toHaveBeenCalled();
  });
});
