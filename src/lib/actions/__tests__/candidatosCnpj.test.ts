import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  // Banco transacional (Supabase): só `Fornecedor` é consultado aqui.
  db: {
    empresaCandidataFornecedor: { findMany: vi.fn(), findUnique: vi.fn(), groupBy: vi.fn() },
    $queryRaw: vi.fn(),
    fornecedor: { findMany: vi.fn() },
  },
  // Banco de candidatos (VPS): a tabela de 8,66M linhas.
  dbCandidatos: {
    empresaCandidataFornecedor: { findMany: vi.fn(), findUnique: vi.fn(), groupBy: vi.fn() },
    $queryRaw: vi.fn(),
  },
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  registrarAuditoria: vi.fn(),
  adicionarCandidatoNaPlanilha: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
// Bancos distintos de propósito (ver lib/dbCandidatos.ts): `Fornecedor` vive no
// transacional, `EmpresaCandidataFornecedor` no banco de candidatos. Mockar os dois
// separadamente é o que permite ao teste abaixo provar que cada consulta vai para o
// banco certo — um mock só não distinguiria a troca.
vi.mock("@/lib/dbCandidatos", () => ({ dbCandidatos: mocks.dbCandidatos }));
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
    expect(mocks.dbCandidatos.empresaCandidataFornecedor.findMany).not.toHaveBeenCalled();
    expect(mocks.db.fornecedor.findMany).not.toHaveBeenCalled();
  });

  it("não consulta o banco quando o município é string vazia", async () => {
    const resultado = await buscarCandidatosCnpj({ municipio: "   " });

    expect(resultado.error).toBeTruthy();
    expect(mocks.dbCandidatos.empresaCandidataFornecedor.findMany).not.toHaveBeenCalled();
  });

  it("usa select explícito (nunca include) e monta o where com estado fixo SP e cursor", async () => {
    mocks.dbCandidatos.empresaCandidataFornecedor.findMany.mockResolvedValue([
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
    const chamada = mocks.dbCandidatos.empresaCandidataFornecedor.findMany.mock.calls[0]![0];
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

  // A fronteira entre os dois bancos é o ponto central do desenho (ver lib/dbCandidatos.ts):
  // candidato vem do VPS, `Fornecedor` vem do transacional. Trocar um pelo outro não quebra
  // tipo nem teste de resultado — só este, que olha QUAL cliente recebeu cada consulta.
  // Em produção o erro seria silencioso e grave: consultar candidatos no Supabase devolve a
  // amostra velha de 500 (ou estoura timeout), e consultar `Fornecedor` no VPS devolve zero,
  // marcando todo candidato como "ainda não é fornecedor" e liberando duplicata.
  it("lê candidato do banco de candidatos e Fornecedor do transacional, nunca trocados", async () => {
    mocks.dbCandidatos.empresaCandidataFornecedor.findMany.mockResolvedValue([
      {
        id: "cand-1",
        cnpj: "11222333000181",
        razaoSocial: "Empresa A",
        nomeFantasia: null,
        municipio: "Santos",
        estado: "SP",
        cnaePrincipalCodigo: "4520-0/01",
        cnaePrincipalDescricao: "Serviços",
        categoriaSugerida: [],
      },
    ]);
    mocks.db.fornecedor.findMany.mockResolvedValue([]);

    await buscarCandidatosCnpj({ municipio: "santos" });

    expect(mocks.dbCandidatos.empresaCandidataFornecedor.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.db.fornecedor.findMany).toHaveBeenCalledTimes(1);
    // O banco de candidatos não conhece `Fornecedor`; o transacional não deve receber
    // consulta de candidato.
    expect(mocks.db.empresaCandidataFornecedor.findMany).not.toHaveBeenCalled();
    expect(mocks.dbCandidatos).not.toHaveProperty("fornecedor");
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
    mocks.dbCandidatos.empresaCandidataFornecedor.findMany.mockResolvedValue(registros);
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
    mocks.dbCandidatos.empresaCandidataFornecedor.findUnique.mockResolvedValue(CANDIDATO_DB);
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
    mocks.dbCandidatos.empresaCandidataFornecedor.findUnique.mockResolvedValue(CANDIDATO_DB);
    mocks.adicionarCandidatoNaPlanilha.mockRejectedValue(new Error("Sheets fora do ar"));

    const resultado = await adicionarCandidatoAPlanilha(CANDIDATO_ID);

    expect(resultado.error).toBe("Sheets fora do ar");
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("devolve erro sem chamar a planilha quando o candidato não existe", async () => {
    mocks.dbCandidatos.empresaCandidataFornecedor.findUnique.mockResolvedValue(null);

    const resultado = await adicionarCandidatoAPlanilha(CANDIDATO_ID);

    expect(resultado.error).toBe("Candidato não encontrado");
    expect(mocks.adicionarCandidatoNaPlanilha).not.toHaveBeenCalled();
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("rejeita um id em formato CUID (formato real em produção é UUID)", async () => {
    const resultado = await adicionarCandidatoAPlanilha("ckqut11d0000abcdefghijklm");

    expect(resultado.error).toBe("Identificador de candidato inválido");
    expect(mocks.dbCandidatos.empresaCandidataFornecedor.findUnique).not.toHaveBeenCalled();
  });
});

describe("listarMunicipiosComCandidatos", () => {
  // O módulo mantém o resultado em cache (module-level `let`, TTL 5min) — sem `resetModules` +
  // import dinâmico, a 1ª chamada de qualquer teste "vazaria" cache para os seguintes, mesmo
  // padrão já usado no projeto para estado de módulo (CLAUDE.md §9.34).
  async function importarModuloFresco() {
    vi.resetModules();
    return import("../candidatosCnpj");
  }

  /** Texto plano da query montada pelo template tag do Prisma (`$queryRaw`). */
  function sqlDaChamada(): string {
    const [template] = mocks.dbCandidatos.$queryRaw.mock.calls[0] as [TemplateStringsArray];
    return template.join(" ");
  }

  it("devolve os municípios do estado importado (SP), em ordem", async () => {
    mocks.dbCandidatos.$queryRaw.mockResolvedValue([
      { municipio: "Campinas" },
      { municipio: "Santos" },
      { municipio: "Sao Paulo" },
    ]);

    const { listarMunicipiosComCandidatos: listar } = await importarModuloFresco();
    const resultado = await listar();

    expect(resultado).toEqual(["Campinas", "Santos", "Sao Paulo"]);
    // O estado entra como parâmetro do template tag, nunca interpolado no SQL.
    expect(mocks.dbCandidatos.$queryRaw.mock.calls[0]?.slice(1)).toContain("SP");
  });

  // A garantia que essa função existe para dar: em produção o `GROUP BY` varria os 8,66M
  // candidatos, estourava o `statement_timeout` (57014) e deixava a tela em branco — e como
  // toda tentativa falhava, o cache nunca era populado. Trocar o skip scan de volta por um
  // agrupamento/DISTINCT reintroduz exatamente esse bug, então o teste ancora na forma da
  // query, não no resultado (que um GROUP BY também devolveria certo, em outro tempo).
  it("consulta por skip scan recursivo, nunca varrendo a tabela com GROUP BY/DISTINCT", async () => {
    mocks.dbCandidatos.$queryRaw.mockResolvedValue([{ municipio: "Santos" }]);

    const { listarMunicipiosComCandidatos: listar } = await importarModuloFresco();
    await listar();

    const sql = sqlDaChamada();
    expect(sql).toMatch(/WITH RECURSIVE/i);
    expect(sql).toMatch(/LIMIT 1/i);
    expect(sql).not.toMatch(/GROUP BY/i);
    expect(sql).not.toMatch(/DISTINCT/i);
    // `groupBy` do Prisma é o caminho antigo — não pode ressurgir por baixo dos panos.
    expect(mocks.dbCandidatos.empresaCandidataFornecedor.groupBy).not.toHaveBeenCalled();
  });

  it("exige autenticação antes de consultar o banco", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("não autenticado"));
    mocks.dbCandidatos.$queryRaw.mockResolvedValue([]);

    const { listarMunicipiosComCandidatos: listar } = await importarModuloFresco();

    await expect(listar()).rejects.toThrow("não autenticado");
    expect(mocks.dbCandidatos.$queryRaw).not.toHaveBeenCalled();
  });

  it("devolve lista vazia quando não há nenhum candidato importado", async () => {
    mocks.dbCandidatos.$queryRaw.mockResolvedValue([]);

    const { listarMunicipiosComCandidatos: listar } = await importarModuloFresco();
    const resultado = await listar();

    expect(resultado).toEqual([]);
  });

  it("não consulta o banco de novo dentro do TTL (cache em memória)", async () => {
    mocks.dbCandidatos.$queryRaw.mockResolvedValue([{ municipio: "Santos" }]);

    const { listarMunicipiosComCandidatos: listar } = await importarModuloFresco();
    await listar();
    await listar();

    expect(mocks.dbCandidatos.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
