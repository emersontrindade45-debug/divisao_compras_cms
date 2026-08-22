import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbCandidatos: {
    empresaCandidataFornecedor: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
  requireAuth: vi.fn(),
  registrarAuditoria: vi.fn(),
  sugerirCnaesParaObjeto: vi.fn(),
}));

vi.mock("@/lib/dbCandidatos", () => ({ dbCandidatos: mocks.dbCandidatos }));
vi.mock("@/lib/auth/rbac", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("@/lib/ia/sugerirCnaesParaObjeto", () => ({
  sugerirCnaesParaObjeto: mocks.sugerirCnaesParaObjeto,
}));

// `vi.resetModules()` + import dinâmico porque o cache do catálogo é estado de módulo (§9.34):
// sem instância nova, um teste veria o cache populado pelo anterior.
async function importarAcao() {
  vi.resetModules();
  return (await import("../sugerirCandidatosCotacao")).sugerirCandidatosParaObjeto;
}

import { sugerirCandidatosParaObjeto } from "../sugerirCandidatosCotacao";

function candidato(over: Partial<Record<string, unknown>> & { id: string }) {
  return {
    cnpj: `cnpj-${over.id}`,
    razaoSocial: `Empresa ${over.id}`,
    email: `e${over.id}@x.com`,
    municipio: "Santos",
    estado: "SP",
    cnaePrincipalCodigo: "4761003",
    cnaePrincipalDescricao: "Comércio varejista de artigos de papelaria",
    ...over,
  };
}

describe("sugerirCandidatosParaObjeto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-1" });
    mocks.dbCandidatos.empresaCandidataFornecedor.groupBy.mockResolvedValue([
      { cnaePrincipalCodigo: "4761003", cnaePrincipalDescricao: "Papelaria" },
    ]);
    mocks.dbCandidatos.empresaCandidataFornecedor.count.mockResolvedValue(0);
  });

  it("exige autenticação", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("não autenticado"));

    await expect(sugerirCandidatosParaObjeto("caneta")).rejects.toThrow();
  });

  it("retorna vazio sem chamar a IA quando o objeto está em branco", async () => {
    const r = await sugerirCandidatosParaObjeto("   ");

    expect(r).toEqual({ cnaesSugeridos: [], candidatos: [], totalEncontrado: 0 });
    expect(mocks.sugerirCnaesParaObjeto).not.toHaveBeenCalled();
  });

  it("não busca empresas quando a IA não achou CNAE pertinente", async () => {
    mocks.sugerirCnaesParaObjeto.mockResolvedValue([]);

    const r = await sugerirCandidatosParaObjeto("objeto sem correspondência");

    expect(r.candidatos).toEqual([]);
    expect(mocks.dbCandidatos.empresaCandidataFornecedor.findMany).not.toHaveBeenCalled();
  });

  it("só devolve empresas com e-mail — sem contato não há como consultar", async () => {
    mocks.sugerirCnaesParaObjeto.mockResolvedValue(["4761003"]);
    mocks.dbCandidatos.empresaCandidataFornecedor.findMany.mockResolvedValue([
      candidato({ id: "1" }),
      candidato({ id: "2", email: null }),
    ]);

    const r = await sugerirCandidatosParaObjeto("caneta");

    expect(r.candidatos.map((c) => c.id)).toEqual(["1"]);
    const where = mocks.dbCandidatos.empresaCandidataFornecedor.findMany.mock.calls[0][0].where;
    expect(where.email).toEqual({ not: null });
  });

  it("aplica o teto de 500 candidatos", async () => {
    mocks.sugerirCnaesParaObjeto.mockResolvedValue(["4761003"]);
    mocks.dbCandidatos.empresaCandidataFornecedor.findMany.mockResolvedValue(
      Array.from({ length: 900 }, (_, i) => candidato({ id: String(i).padStart(4, "0") })),
    );

    const r = await sugerirCandidatosParaObjeto("caneta");

    expect(r.candidatos).toHaveLength(500);
  });

  it("marca e-mail compartilhado por mais de uma empresa", async () => {
    mocks.sugerirCnaesParaObjeto.mockResolvedValue(["4761003"]);
    mocks.dbCandidatos.empresaCandidataFornecedor.findMany.mockResolvedValue([
      candidato({ id: "1", email: "contador@x.com" }),
      candidato({ id: "2", email: "contador@x.com" }),
      candidato({ id: "3", email: "proprio@y.com" }),
    ]);

    const r = await sugerirCandidatosParaObjeto("caneta");
    const porId = new Map(r.candidatos.map((c) => [c.id, c.emailCompartilhado]));

    expect(porId.get("3")).toBe(false);
    expect(porId.get("1")).toBe(true);
    expect(porId.get("2")).toBe(true);
    // Compartilhado é despriorizado, nunca removido (decisão do usuário).
    expect(r.candidatos).toHaveLength(3);
  });

  it("trata e-mail compartilhado ignorando diferença de caixa", async () => {
    mocks.sugerirCnaesParaObjeto.mockResolvedValue(["4761003"]);
    mocks.dbCandidatos.empresaCandidataFornecedor.findMany.mockResolvedValue([
      candidato({ id: "1", email: "Contador@X.com" }),
      candidato({ id: "2", email: "contador@x.com" }),
    ]);

    const r = await sugerirCandidatosParaObjeto("caneta");

    expect(r.candidatos.every((c) => c.emailCompartilhado)).toBe(true);
  });

  it("reporta o total REAL da base, não o tamanho da janela lida", async () => {
    mocks.sugerirCnaesParaObjeto.mockResolvedValue(["4761003"]);
    mocks.dbCandidatos.empresaCandidataFornecedor.findMany.mockResolvedValue([candidato({ id: "1" })]);
    mocks.dbCandidatos.empresaCandidataFornecedor.count.mockResolvedValue(31234);

    const r = await sugerirCandidatosParaObjeto("caneta");

    expect(r.totalEncontrado).toBe(31234);
  });

  it("registra auditoria da sugestão (rastreabilidade por usuário)", async () => {
    mocks.sugerirCnaesParaObjeto.mockResolvedValue(["4761003"]);
    mocks.dbCandidatos.empresaCandidataFornecedor.findMany.mockResolvedValue([candidato({ id: "1" })]);

    await sugerirCandidatosParaObjeto("caneta");

    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", acao: "sugerir_candidatos_cotacao" }),
    );
  });

  it("não grava nada na base de candidatos (a sugestão é só leitura)", async () => {
    mocks.sugerirCnaesParaObjeto.mockResolvedValue(["4761003"]);
    mocks.dbCandidatos.empresaCandidataFornecedor.findMany.mockResolvedValue([candidato({ id: "1" })]);

    await sugerirCandidatosParaObjeto("caneta");

    // Varre a superfície inteira de escrita em vez de listar nomes lembrados na hora (§9.56).
    for (const [nome, fn] of Object.entries(mocks.dbCandidatos.empresaCandidataFornecedor)) {
      if (["groupBy", "findMany", "count"].includes(nome)) continue;
      expect(fn, `${nome} não deveria ter sido chamado`).not.toHaveBeenCalled();
    }
  });

  it("cacheia o catálogo de CNAEs entre chamadas (o groupBy varre a tabela inteira)", async () => {
    const acao = await importarAcao();
    mocks.sugerirCnaesParaObjeto.mockResolvedValue(["4761003"]);
    mocks.dbCandidatos.empresaCandidataFornecedor.findMany.mockResolvedValue([candidato({ id: "1" })]);

    await acao("caneta");
    await acao("outro objeto");

    // Duas buscas, mas o catálogo é montado uma vez só.
    expect(mocks.dbCandidatos.empresaCandidataFornecedor.groupBy).toHaveBeenCalledTimes(1);
    expect(mocks.sugerirCnaesParaObjeto).toHaveBeenCalledTimes(2);
  });

  it("lê uma janela limitada, não a tabela inteira", async () => {
    mocks.sugerirCnaesParaObjeto.mockResolvedValue(["4761003"]);
    mocks.dbCandidatos.empresaCandidataFornecedor.findMany.mockResolvedValue([candidato({ id: "1" })]);

    await sugerirCandidatosParaObjeto("caneta");

    const args = mocks.dbCandidatos.empresaCandidataFornecedor.findMany.mock.calls[0][0];
    expect(args.take).toBeLessThanOrEqual(2000);
    expect(args.take).toBeGreaterThanOrEqual(500);
  });
});
