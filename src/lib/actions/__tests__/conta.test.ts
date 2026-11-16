import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { user: { findUnique: vi.fn(), update: vi.fn() } },
  requireAuth: vi.fn(),
  registrarAuditoria: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));

import { alterarSenha } from "../conta";

const SENHA_ATUAL = "senhaAtual123";
// Hash real: o teste exercita o bcrypt.compare de verdade, não um mock que diria "confere" sempre.
const HASH_ATUAL = bcrypt.hashSync(SENHA_ATUAL, 4);

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const VALIDO = { senhaAtual: SENHA_ATUAL, novaSenha: "novaSenha456", confirmacao: "novaSenha456" };

describe("alterarSenha", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-1", email: "u@e.com", name: "U", role: "pesquisa" });
    mocks.db.user.findUnique.mockResolvedValue({ passwordHash: HASH_ATUAL });
    mocks.db.user.update.mockResolvedValue({});
  });

  it("troca a senha do usuário da SESSÃO e grava um hash que confere com a nova", async () => {
    const r = await alterarSenha({}, form({ ...VALIDO, userId: "outra-pessoa" }));

    expect(r).toEqual({ ok: true });
    expect(mocks.db.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { passwordHash: true },
    });
    const arg = mocks.db.user.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "user-1" });
    expect(Object.keys(arg.data)).toEqual(["passwordHash"]);
    expect(bcrypt.compareSync("novaSenha456", arg.data.passwordHash)).toBe(true);
    expect(arg.data.passwordHash).not.toContain("novaSenha456");
  });

  it("registra auditoria sem nada da senha", async () => {
    await alterarSenha({}, form(VALIDO));

    expect(mocks.registrarAuditoria).toHaveBeenCalledWith({ userId: "user-1", acao: "senha_alterada" });
  });

  it("recusa quando a senha atual está errada e não grava nada", async () => {
    const r = await alterarSenha({}, form({ ...VALIDO, senhaAtual: "errada999" }));

    expect(r.error).toBe("Senha atual incorreta");
    expect(mocks.db.user.update).not.toHaveBeenCalled();
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it.each([
    ["nova senha curta", { novaSenha: "curta12", confirmacao: "curta12" }, "pelo menos 8"],
    ["confirmação diferente", { confirmacao: "outraCoisa1" }, "confirmação não confere"],
    ["nova igual à atual", { novaSenha: SENHA_ATUAL, confirmacao: SENHA_ATUAL }, "diferente da atual"],
    ["nova acima de 72", { novaSenha: "a".repeat(73), confirmacao: "a".repeat(73) }, "no máximo 72"],
  ])("recusa %s antes de tocar no banco", async (_nome, mudanca, trecho) => {
    const r = await alterarSenha({}, form({ ...VALIDO, ...mudanca }));

    expect(r.error).toContain(trecho);
    expect(mocks.db.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.user.update).not.toHaveBeenCalled();
  });

  it("aceita exatamente 8 caracteres", async () => {
    const r = await alterarSenha({}, form({ ...VALIDO, novaSenha: "12345678", confirmacao: "12345678" }));

    expect(r).toEqual({ ok: true });
  });
});
