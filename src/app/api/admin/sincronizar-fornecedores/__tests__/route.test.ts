import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchText: vi.fn(),
  sincronizar: vi.fn(),
}));

vi.mock("@/lib/sheets/googleSheets", () => ({
  fetchText: mocks.fetchText,
  extrairSpreadsheetId: (url: string) => {
    const m = url.match(/\/spreadsheets\/d\/([\w-]+)/);
    return m?.[1] ?? null;
  },
  csvUrl: (id: string, gid: string) =>
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`,
}));

vi.mock("@/lib/ingestao/sincronizarFornecedores", () => ({
  sincronizarFornecedores: mocks.sincronizar,
}));

import { POST } from "../route";

function requisicao(authorization?: string): Request {
  return new Request("https://exemplo.test/api/admin/sincronizar-fornecedores", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

const RESULTADO_PADRAO = {
  sincronizacaoId: "sync-1",
  linhasLidas: 5595,
  linhasCriadas: 0,
  linhasAtualizadas: 5595,
  linhasDesativadas: 0,
  linhasRejeitadas: 3,
};

describe("POST /api/admin/sincronizar-fornecedores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.fetchText.mockResolvedValue("#,Nome/Razão Social,CPF/CNPJ\n1,ACME,\n");
    mocks.sincronizar.mockResolvedValue(RESULTADO_PADRAO);
  });

  it("nega acesso quando ADMIN_MIGRATE_SECRET não está configurado (fail-closed)", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "");
    vi.stubEnv("FORNECEDORES_SHEETS_URL", "https://docs.google.com/spreadsheets/d/abc123/edit");

    const res = await POST(requisicao("Bearer qualquer-coisa"));

    expect(res.status).toBe(401);
    expect(mocks.sincronizar).not.toHaveBeenCalled();
  });

  it("nega acesso com Bearer errado", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");
    vi.stubEnv("FORNECEDORES_SHEETS_URL", "https://docs.google.com/spreadsheets/d/abc123/edit");

    const res = await POST(requisicao("Bearer errado"));

    expect(res.status).toBe(401);
    expect(mocks.sincronizar).not.toHaveBeenCalled();
  });

  it("devolve 500 sem chamar a sincronização quando FORNECEDORES_SHEETS_URL não está configurada", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");
    vi.stubEnv("FORNECEDORES_SHEETS_URL", "");

    const res = await POST(requisicao("Bearer segredo-correto"));
    const corpo = await res.json();

    expect(res.status).toBe(500);
    expect(corpo.ok).toBe(false);
    expect(mocks.sincronizar).not.toHaveBeenCalled();
  });

  it("busca o CSV da planilha e chama sincronizarFornecedores com origem manual", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");
    vi.stubEnv("FORNECEDORES_SHEETS_URL", "https://docs.google.com/spreadsheets/d/abc123/edit");

    const res = await POST(requisicao("Bearer segredo-correto"));
    const corpo = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.fetchText).toHaveBeenCalledWith(
      expect.stringContaining("docs.google.com/spreadsheets/d/abc123/gviz/tq"),
    );
    expect(mocks.sincronizar).toHaveBeenCalledWith({
      csv: "#,Nome/Razão Social,CPF/CNPJ\n1,ACME,\n",
      origem: "manual",
    });
    expect(corpo.ok).toBe(true);
    expect(corpo.linhasAtualizadas).toBe(5595);
  });

  it("devolve 500 com detalhe do erro quando a sincronização lança exceção", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");
    vi.stubEnv("FORNECEDORES_SHEETS_URL", "https://docs.google.com/spreadsheets/d/abc123/edit");
    mocks.sincronizar.mockRejectedValue(new Error("conexão perdida"));

    const res = await POST(requisicao("Bearer segredo-correto"));
    const corpo = await res.json();

    expect(res.status).toBe(500);
    expect(corpo.ok).toBe(false);
    expect(corpo.erro).toContain("conexão perdida");
  });
});
