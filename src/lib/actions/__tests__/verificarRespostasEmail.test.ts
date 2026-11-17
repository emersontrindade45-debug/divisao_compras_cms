import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  sincronizar: vi.fn(),
}));

vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/emailCotacao/sincronizar", () => ({ sincronizarRespostasEmail: mocks.sincronizar }));

import { verificarRespostasEmail } from "../verificarRespostasEmail";

const SEGREDO = "segredo-de-teste-9f2";
const RESUMO = {
  envios: 1, enviosNovos: 1, consultasNovas: 3, respostasClassificadas: 1,
  respostasNaFila: 0, emailsInvalidos: 0, enviosSemProcesso: 0,
};
const PAYLOAD_OK = { envios: [], respostas: [] };

function responder(corpo: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => corpo });
}

describe("verificarRespostasEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "u1", role: "pesquisa", name: "U", email: "u@e.com" });
    mocks.sincronizar.mockResolvedValue(RESUMO);
    process.env.APPS_SCRIPT_URL = "https://script.google.com/macros/s/ID/exec";
    process.env.APPS_SCRIPT_SEGREDO = SEGREDO;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.APPS_SCRIPT_URL;
    delete process.env.APPS_SCRIPT_SEGREDO;
  });

  it("sem configuração, nega sem chamar ninguém (fail-closed)", async () => {
    delete process.env.APPS_SCRIPT_SEGREDO;
    const f = responder(PAYLOAD_OK);
    vi.stubGlobal("fetch", f);
    const r = await verificarRespostasEmail();
    expect(r.error).toMatch(/não foi configurada/);
    expect(f).not.toHaveBeenCalled();
  });

  it("chama o script com o segredo e a janela de 30 dias, e grava o resumo na auditoria", async () => {
    const f = responder(PAYLOAD_OK);
    vi.stubGlobal("fetch", f);
    const r = await verificarRespostasEmail();

    expect(r.data).toEqual(RESUMO);
    expect(f.mock.calls[0]![0]).toBe("https://script.google.com/macros/s/ID/exec");
    expect(JSON.parse(f.mock.calls[0]![1].body)).toEqual({ segredo: SEGREDO, dias: 30 });
    expect(f.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal); // todo fetch com prazo (§9.64)
    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "verificar_respostas_email", detalhes: RESUMO }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cotacoes");
  });

  it("passa o processo pedido ao núcleo (botão da página do processo)", async () => {
    vi.stubGlobal("fetch", responder(PAYLOAD_OK));
    await verificarRespostasEmail("ckqut11d0000abcdefghijklm");
    expect(mocks.sincronizar).toHaveBeenCalledWith(PAYLOAD_OK, { processoId: "ckqut11d0000abcdefghijklm" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/processos/ckqut11d0000abcdefghijklm");
  });

  it("recusa id de processo que não é um cuid", async () => {
    const f = responder(PAYLOAD_OK);
    vi.stubGlobal("fetch", f);
    expect((await verificarRespostasEmail("../etc/passwd")).error).toBe("Processo inválido.");
    expect(f).not.toHaveBeenCalled();
  });

  it("resposta de erro do script (segredo errado) não vai para o núcleo", async () => {
    vi.stubGlobal("fetch", responder({ erro: "nao_autorizado" }));
    const r = await verificarRespostasEmail();
    expect(r.error).toMatch(/formato esperado/);
    expect(mocks.sincronizar).not.toHaveBeenCalled();
  });

  it("campo de conteúdo no payload derruba a leitura inteira (trava de sigilo)", async () => {
    vi.stubGlobal("fetch", responder({
      envios: [{ id: "g", fio: "f", data: "2026-11-16T15:00:00.000Z", destinatarios: [], processo: "1", prazo: null, prazoOrigem: null, assunto: "TEXTO SIGILOSO" }],
      respostas: [],
    }));
    const r = await verificarRespostasEmail();
    expect(r.error).toBeDefined();
    expect(JSON.stringify(r)).not.toContain("TEXTO SIGILOSO");
    expect(mocks.sincronizar).not.toHaveBeenCalled();
  });

  it("falha de rede devolve texto fixo, sem a mensagem da exceção", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`falhou ${SEGREDO} MARCADOR_REDE`)));
    const r = await verificarRespostasEmail();
    expect(r.error).toMatch(/Não foi possível ler/);
    expect(JSON.stringify(r)).not.toMatch(/MARCADOR_REDE|segredo-de-teste/);
  });

  it("HTTP de erro do Google não expõe o corpo", async () => {
    vi.stubGlobal("fetch", responder({ detalhe: "MARCADOR_HTTP" }, false));
    const r = await verificarRespostasEmail();
    expect(r.error).toMatch(/recusou/);
    expect(JSON.stringify(r)).not.toContain("MARCADOR_HTTP");
  });

  it("exceção ao gravar nunca propaga nem leva o texto dela ao usuário", async () => {
    vi.stubGlobal("fetch", responder(PAYLOAD_OK));
    mocks.sincronizar.mockRejectedValue(new Error("Invalid input: remetente=MARCADOR_DB@x.com"));
    const r = await verificarRespostasEmail();
    expect(r.error).toMatch(/não foi possível gravá-las/);
    expect(JSON.stringify(r)).not.toContain("MARCADOR_DB");
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("a auditoria só carrega contagens, nunca o segredo", async () => {
    vi.stubGlobal("fetch", responder(PAYLOAD_OK));
    await verificarRespostasEmail();
    expect(JSON.stringify(mocks.registrarAuditoria.mock.calls)).not.toContain(SEGREDO);
  });

  it("com janela, repassa desdeDias/dias ao script (histórico em fatias)", async () => {
    const f = responder(PAYLOAD_OK);
    vi.stubGlobal("fetch", f);
    await verificarRespostasEmail(undefined, { desdeDias: 60, dias: 30 });
    expect(JSON.parse(f.mock.calls[0]![1].body)).toEqual({ segredo: SEGREDO, dias: 30, desdeDias: 60 });
  });

  it.each([{ desdeDias: -1, dias: 30 }, { desdeDias: 0, dias: 400 }, { desdeDias: 1.5, dias: 5 }])(
    "recusa janela inválida %j sem chamar o Google",
    async (janela) => {
      const f = responder(PAYLOAD_OK);
      vi.stubGlobal("fetch", f);
      expect((await verificarRespostasEmail(undefined, janela)).error).toBe("Janela de leitura inválida.");
      expect(f).not.toHaveBeenCalled();
    },
  );

  it("avisa quando o script diz que a fatia foi truncada", async () => {
    vi.stubGlobal("fetch", responder({
      ...PAYLOAD_OK,
      diagnostico: { versao: "v", contaEfetiva: "a@b.com", contaAtiva: "a@b.com", fiosEncontrados: 800, fiosTruncados: true },
    }));
    const r = await verificarRespostasEmail(undefined, { desdeDias: 0, dias: 30 });
    expect(r.data).toEqual({ ...RESUMO, fiosTruncados: true });
  });
});
