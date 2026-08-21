import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    empresaCandidataFornecedor: { findMany: vi.fn(), findUnique: vi.fn(), groupBy: vi.fn() },
    fornecedor: { findMany: vi.fn() },
  },
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
  adicionarCandidatoNaPlanilha: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("@/lib/sheets/escreverCandidatoNaPlanilha", () => ({
  adicionarCandidatoNaPlanilha: mocks.adicionarCandidatoNaPlanilha,
  FONTE_CANDIDATOS_CNPJ: "M27 — Receita Federal",
}));

import { adicionarCandidatoAPlanilha, buscarCandidatosCnpj } from "../candidatosCnpj";

const USUARIO = { id: "user-1", role: "pesquisa", email: "u@e.com", name: "Usuário" };
// UUID, não CUID: é o formato real gravado em produção (gen_random_uuid() no
// SQL bruto de importarCandidatosCnpj.ts) — ver comentário em candidatosCnpj.ts.
const CANDIDATO_ID = "e8d4f299-603f-4510-882c-890a39f41e22";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue(USUARIO);
  mocks.requireRole.mockResolvedValue(USUARIO);
});

describe("buscarCandidatosCnpj", () => {
  it("não consulta o banco quando o município está ausente", async () => {
    const resultado = await buscarCandidatosCnpj({});

    expect(resultado.error).toBeTruthy();
    expect(mocks.db.empresaCandidataFornecedor.findMany).not.toHaveBeenCalled();
    expect(mocks.db.fornecedor.findMany).not.toHaveBeenCalled();
  });

  it("não consulta o banco quando o município é string vazia", async () => {
    const resultado = await buscarCandidatosCnpj({ municipio: "   " });

    expect(resultado.error).toBeTruthy();
    expect(mocks.db.empresaCandidataFornecedor.findMany).not.toHaveBeenCalled();
  });

  it("usa select explícito (nunca include) e monta o where com estado fixo SP e cursor", async () => {
    mocks.db.empresaCandidataFornecedor.findMany.mockResolvedValue([
      {
        id: "cand-1",
        cnpj: "11222333000181",
        razaoSocial: "Empresa A",
        nomeFantasia: null,
        municipio: "Santos",
        estado: "SP",
        cnaePrincipalCodigo: "4520-0/01",
        cnaePrincipalDescricao: "Serviços de manutenção",
        categoriaSugerida: [],
      },
    ]);
    mocks.db.fornecedor.findMany.mockResolvedValue([]);

    const resultado = await buscarCandidatosCnpj({
      municipio: "santos",
      cnae: "4520",
      categoria: "Manutenção",
      busca: "empresa",
      cursor: "11111111000100",
    });

    expect(resultado.error).toBeUndefined();
    const chamada = mocks.db.empresaCandidataFornecedor.findMany.mock.calls[0]![0];
    expect(chamada.select).toBeDefined();
    expect(chamada.include).toBeUndefined();
    expect(chamada.where).toMatchObject({
      estado: "SP",
      municipio: "Santos",
      cnpj: { gt: "11111111000100" },
      cnaePrincipalCodigo: { startsWith: "4520" },
      categoriaSugerida: { has: "Manutenção" },
      razaoSocial: { contains: "empresa", mode: "insensitive" },
    });
  });

  it("marca jaEhFornecedor e calcula proximoCursor quando há mais de uma página", async () => {
    const registros = Array.from({ length: 51 }, (_, i) => ({
      id: `cand-${i}`,
      cnpj: String(11222333000100 + i).padStart(14, "0"),
      razaoSocial: `Empresa ${i}`,
      nomeFantasia: null,
      municipio: "Santos",
      estado: "SP",
      cnaePrincipalCodigo: "4520-0/01",
      cnaePrincipalDescricao: "Serviços de manutenção",
      categoriaSugerida: [],
    }));
    mocks.db.empresaCandidataFornecedor.findMany.mockResolvedValue(registros);
    mocks.db.fornecedor.findMany.mockResolvedValue([{ cnpj: "11.222.333/0001-00" }]);

    const resultado = await buscarCandidatosCnpj({ municipio: "santos" });

    expect(resultado.data?.candidatos).toHaveLength(50);
    expect(resultado.data?.candidatos[0]!.jaEhFornecedor).toBe(true);
    expect(resultado.data?.candidatos[1]!.jaEhFornecedor).toBe(false);
    expect(resultado.data?.proximoCursor).toBe(registros[49]!.cnpj);
  });
});

describe("adicionarCandidatoAPlanilha", () => {
  const CANDIDATO_DB = {
    id: CANDIDATO_ID,
    cnpj: "11222333000181",
    razaoSocial: "Empresa Nova",
    municipio: "Santos",
    estado: "SP",
    email: "contato@empresa.com",
    telefone: "13988887777",
    categoriaSugerida: ["Móveis"],
  };

  it("registra auditoria só depois da escrita na planilha ter sucesso", async () => {
    mocks.db.empresaCandidataFornecedor.findUnique.mockResolvedValue(CANDIDATO_DB);
    mocks.adicionarCandidatoNaPlanilha.mockResolvedValue({ linhaId: "10", jaExistente: false });

    const resultado = await adicionarCandidatoAPlanilha(CANDIDATO_ID);

    expect(resultado.error).toBeUndefined();
    expect(mocks.adicionarCandidatoNaPlanilha).toHaveBeenCalledWith({
      cnpj: "11.222.333/0001-81",
      razaoSocial: "Empresa Nova",
      cidade: "Santos",
      estado: "SP",
      email: "contato@empresa.com",
      telefone: "13988887777",
      fonte: "M27 — Receita Federal",
      categoria: ["Móveis"],
    });
    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        acao: "adicionar_candidato_planilha",
        detalhes: expect.objectContaining({ candidatoId: CANDIDATO_ID, linhaId: "10" }),
      }),
    );
  });

  it("não registra auditoria quando a escrita na planilha falha", async () => {
    mocks.db.empresaCandidataFornecedor.findUnique.mockResolvedValue(CANDIDATO_DB);
    mocks.adicionarCandidatoNaPlanilha.mockRejectedValue(new Error("Sheets fora do ar"));

    const resultado = await adicionarCandidatoAPlanilha(CANDIDATO_ID);

    expect(resultado.error).toBe("Sheets fora do ar");
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("devolve erro sem chamar a planilha quando o candidato não existe", async () => {
    mocks.db.empresaCandidataFornecedor.findUnique.mockResolvedValue(null);

    const resultado = await adicionarCandidatoAPlanilha(CANDIDATO_ID);

    expect(resultado.error).toBe("Candidato não encontrado");
    expect(mocks.adicionarCandidatoNaPlanilha).not.toHaveBeenCalled();
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("rejeita um id em formato CUID (formato real em produção é UUID)", async () => {
    const resultado = await adicionarCandidatoAPlanilha("ckqut11d0000abcdefghijklm");

    expect(resultado.error).toBe("Identificador de candidato inválido");
    expect(mocks.db.empresaCandidataFornecedor.findUnique).not.toHaveBeenCalled();
  });
});

describe("listarMunicipiosComCandidatos", () => {
  // O módulo mantém o resultado em cache (module-level `let`, TTL 1h) — sem `resetModules` +
  // import dinâmico, a 1ª chamada de qualquer teste "vazaria" cache para os seguintes, mesmo
  // padrão já usado no projeto para estado de módulo (CLAUDE.md §9.34).
  async function importarModuloFresco() {
    vi.resetModules();
    return import("../candidatosCnpj");
  }

  it("agrupa por município, filtrando pelo estado importado (SP)", async () => {
    mocks.db.empresaCandidataFornecedor.groupBy.mockResolvedValue([
      { municipio: "Campinas" },
      { municipio: "Santos" },
      { municipio: "Sao Paulo" },
    ]);

    const { listarMunicipiosComCandidatos: listar } = await importarModuloFresco();
    const resultado = await listar();

    expect(resultado).toEqual(["Campinas", "Santos", "Sao Paulo"]);
    expect(mocks.db.empresaCandidataFornecedor.groupBy).toHaveBeenCalledWith({
      by: ["municipio"],
      where: { estado: "SP" },
      orderBy: { municipio: "asc" },
    });
  });

  it("exige autenticação antes de consultar o banco", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("não autenticado"));
    mocks.db.empresaCandidataFornecedor.groupBy.mockResolvedValue([]);

    const { listarMunicipiosComCandidatos: listar } = await importarModuloFresco();

    await expect(listar()).rejects.toThrow("não autenticado");
    expect(mocks.db.empresaCandidataFornecedor.groupBy).not.toHaveBeenCalled();
  });

  it("devolve lista vazia quando não há nenhum candidato importado", async () => {
    mocks.db.empresaCandidataFornecedor.groupBy.mockResolvedValue([]);

    const { listarMunicipiosComCandidatos: listar } = await importarModuloFresco();
    const resultado = await listar();

    expect(resultado).toEqual([]);
  });

  it("não consulta o banco de novo dentro do TTL (cache em memória)", async () => {
    mocks.db.empresaCandidataFornecedor.groupBy.mockResolvedValue([{ municipio: "Santos" }]);

    const { listarMunicipiosComCandidatos: listar } = await importarModuloFresco();
    await listar();
    await listar();

    expect(mocks.db.empresaCandidataFornecedor.groupBy).toHaveBeenCalledTimes(1);
  });
});
