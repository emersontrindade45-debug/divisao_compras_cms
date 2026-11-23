import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  sincronizar: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/emailCotacao/sincronizar", () => ({ sincronizarRespostasEmail: mocks.sincronizar }));

import { executarVerificacao } from "../verificar";

const RESUMO = {
  envios: 1, enviosNovos: 0, consultasNovas: 0, respostasClassificadas: 0,
  respostasNaFila: 0, emailsInvalidos: 0, enviosSemProcesso: 0,
};

describe("executarVerificacao (miolo compartilhado pelo botão e pelo agendamento)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sincronizar.mockResolvedValue(RESUMO);
    process.env.APPS_SCRIPT_URL = "https://script.google.com/macros/s/ID/exec";
    process.env.APPS_SCRIPT_SEGREDO = "segredo-de-teste";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ envios: [], respostas: [] }) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.APPS_SCRIPT_URL;
    delete process.env.APPS_SCRIPT_SEGREDO;
  });

  it("execução AUTOMÁTICA é marcada na auditoria (para separar do clique de uma pessoa)", async () => {
    await executarVerificacao({ userId: "u-sistema", inicioEm: Date.now(), origem: "automatica" });
    const d = mocks.registrarAuditoria.mock.calls[0]![0].detalhes as Record<string, unknown>;
    expect(d.origem).toBe("automatica");
    expect(mocks.registrarAuditoria.mock.calls[0]![0].userId).toBe("u-sistema");
  });

  it("execução manual NÃO leva o campo 'origem' (o formato da auditoria de sempre não muda)", async () => {
    await executarVerificacao({ userId: "u1", inicioEm: Date.now(), origem: "manual" });
    await executarVerificacao({ userId: "u1", inicioEm: Date.now() });
    for (const chamada of mocks.registrarAuditoria.mock.calls) {
      expect(Object.keys(chamada[0].detalhes as object)).not.toContain("origem");
    }
  });

  it("a IA e a auditoria recebem o MESMO usuário: a ação é rastreável a quem a disparou", async () => {
    await executarVerificacao({ userId: "u-sistema", inicioEm: 123, origem: "automatica" });
    expect(mocks.sincronizar).toHaveBeenCalledWith({ envios: [], respostas: [] }, { processoId: undefined, inicioEm: 123, userId: "u-sistema" });
  });

  it("sem configuração do script, nega sem chamar ninguém (fail-closed)", async () => {
    delete process.env.APPS_SCRIPT_URL;
    const r = await executarVerificacao({ userId: "u1", inicioEm: Date.now() });
    expect(r.error).toMatch(/não foi configurada/);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });
});
