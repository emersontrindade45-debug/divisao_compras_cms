import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    empresaCandidataFornecedor: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    fornecedor: { findMany: vi.fn(), create: vi.fn() },
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

import {
  buscarCandidatosFornecedor,
  promoverCandidatoFornecedor,
  TAMANHO_PAGINA_CANDIDATOS,
} from "../candidatosFornecedor";
import { formatarCnpj } from "@/lib/validations/fornecedor";

const CANDIDATO_ID = "ckqut11d0000abcdefghijklm";
const CANDIDATO = {
  id: CANDIDATO_ID,
  cnpj: "12345678000199",
  razaoSocial: "FERRAGENS BAIXADA LTDA",
  nomeFantasia: "Ferragens",
  municipio: "Santos",
  estado: "SP",
  cnaePrincipalCodigo: "4744001",
  cnaePrincipalDescricao: "Comercio varejista de ferragens",
  categoriaSugerida: ["ferragens"],
  email: "contato@ferragens.com.br",
  telefone: "1332221100",
};

describe("formatarCnpj", () => {
  it("mascara 14 dígitos no formato do cadastro", () => {
    expect(formatarCnpj("12345678000199")).toBe("12.345.678/0001-99");
  });

  it("aceita CNPJ já mascarado", () => {
    expect(formatarCnpj("12.345.678/0001-99")).toBe("12.345.678/0001-99");
  });

  it("rejeita comprimento que não é CNPJ — inclusive '15.000', que Number() leria como 15", () => {
    expect(formatarCnpj("15.000")).toBeNull();
    expect(formatarCnpj("123")).toBeNull();
  });
});

describe("buscarCandidatosFornecedor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-1", role: "pesquisa" });
    mocks.db.empresaCandidataFornecedor.findMany.mockResolvedValue([]);
    mocks.db.empresaCandidataFornecedor.findUnique.mockResolvedValue(null);
    mocks.db.empresaCandidataFornecedor.count.mockResolvedValue(0);
    mocks.db.fornecedor.findMany.mockResolvedValue([]);
  });

  it("recusa busca sem filtro e não toca na tabela de milhões de linhas", async () => {
    const r = await buscarCandidatosFornecedor({});

    expect(r.error).toMatch(/filtro/i);
    expect(mocks.db.empresaCandidataFornecedor.findMany).not.toHaveBeenCalled();
    expect(mocks.db.empresaCandidataFornecedor.count).not.toHaveBeenCalled();
    expect(mocks.db.empresaCandidataFornecedor.findUnique).not.toHaveBeenCalled();
  });

  it("recusa string em branco como se não houvesse filtro", async () => {
    const r = await buscarCandidatosFornecedor({ municipio: "  ", categoria: "" });

    expect(r.error).toMatch(/filtro/i);
    expect(mocks.db.empresaCandidataFornecedor.findMany).not.toHaveBeenCalled();
  });

  it("filtra por município normalizado + estado SP, com take e select explícitos", async () => {
    await buscarCandidatosFornecedor({ municipio: "SAO VICENTE" });

    const arg = mocks.db.empresaCandidataFornecedor.findMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ estado: "SP", municipio: "São Vicente" });
    expect(arg.take).toBe(TAMANHO_PAGINA_CANDIDATOS);
    expect(arg.skip).toBe(0);
    expect(arg.select).toEqual(
      expect.objectContaining({
        id: true,
        cnpj: true,
        municipio: true,
        categoriaSugerida: true,
      }),
    );
    expect(arg.include).toBeUndefined();
  });

  it("filtra categoria pelo GIN (has), nunca por contains em texto", async () => {
    await buscarCandidatosFornecedor({ categoria: "limpeza" });

    const arg = mocks.db.empresaCandidataFornecedor.findMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ estado: "SP", categoriaSugerida: { has: "limpeza" } });
  });

  it("busca por CNPJ usa a chave única (14 dígitos), não um findMany", async () => {
    mocks.db.empresaCandidataFornecedor.findUnique.mockResolvedValue(CANDIDATO);

    const r = await buscarCandidatosFornecedor({ cnpj: "12.345.678/0001-99" });

    expect(mocks.db.empresaCandidataFornecedor.findUnique).toHaveBeenCalledWith({
      where: { cnpj: "12345678000199" },
      select: expect.objectContaining({ cnpj: true }),
    });
    expect(mocks.db.empresaCandidataFornecedor.findMany).not.toHaveBeenCalled();
    expect(r.data?.candidatos).toHaveLength(1);
    expect(r.data?.candidatos[0]?.cnpjMascarado).toBe("12.345.678/0001-99");
  });

  it("marca candidato cujo CNPJ já está no cadastro vivo", async () => {
    mocks.db.empresaCandidataFornecedor.findMany.mockResolvedValue([CANDIDATO]);
    mocks.db.empresaCandidataFornecedor.count.mockResolvedValue(1);
    mocks.db.fornecedor.findMany.mockResolvedValue([{ cnpj: "12.345.678/0001-99" }]);

    const r = await buscarCandidatosFornecedor({ municipio: "Santos" });

    expect(r.data?.candidatos[0]?.jaCadastrado).toBe(true);
  });
});

describe("promoverCandidatoFornecedor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "user-1", role: "pesquisa" });
    mocks.db.empresaCandidataFornecedor.findUnique.mockResolvedValue(CANDIDATO);
    mocks.db.fornecedor.create.mockResolvedValue({ id: "forn-novo" });
  });

  it("cria Fornecedor com CNPJ mascarado e categoria sugerida, sem checar existência antes", async () => {
    const r = await promoverCandidatoFornecedor({ candidatoId: CANDIDATO_ID });

    expect(r.data?.fornecedorId).toBe("forn-novo");
    expect(mocks.db.fornecedor.findMany).not.toHaveBeenCalled();
    expect(mocks.db.fornecedor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cnpj: "12.345.678/0001-99",
        razaoSocial: "FERRAGENS BAIXADA LTDA",
        cidade: "Santos",
        estado: "SP",
        categoria: ["ferragens"],
        email: "contato@ferragens.com.br",
      }),
      select: { id: true },
    });
    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "promover_candidato_fornecedor" }),
    );
  });

  it("recusa promover sem categoria (sugerida vazia e sem override)", async () => {
    mocks.db.empresaCandidataFornecedor.findUnique.mockResolvedValue({
      ...CANDIDATO,
      categoriaSugerida: [],
    });

    const r = await promoverCandidatoFornecedor({ candidatoId: CANDIDATO_ID });

    expect(r.error).toMatch(/categoria/i);
    expect(mocks.db.fornecedor.create).not.toHaveBeenCalled();
  });

  it("aceita override de categoria quando a sugerida veio vazia", async () => {
    mocks.db.empresaCandidataFornecedor.findUnique.mockResolvedValue({
      ...CANDIDATO,
      categoriaSugerida: [],
    });

    await promoverCandidatoFornecedor({
      candidatoId: CANDIDATO_ID,
      categoria: ["limpeza"],
    });

    expect(mocks.db.fornecedor.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ categoria: ["limpeza"] }) }),
    );
  });

  it("trata corrida no CNPJ (P2002) como já cadastrado, sem lançar", async () => {
    mocks.db.fornecedor.create.mockRejectedValue({ code: "P2002" });

    const r = await promoverCandidatoFornecedor({ candidatoId: CANDIDATO_ID });

    expect(r.error).toBe("CNPJ já cadastrado");
    expect(mocks.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("descarta e-mail inválido da Receita em vez de falhar a promoção", async () => {
    mocks.db.empresaCandidataFornecedor.findUnique.mockResolvedValue({
      ...CANDIDATO,
      email: "nao-e-email",
    });

    await promoverCandidatoFornecedor({ candidatoId: CANDIDATO_ID });

    expect(mocks.db.fornecedor.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "" }) }),
    );
  });

  it("usa select explícito no candidato (não include)", async () => {
    await promoverCandidatoFornecedor({ candidatoId: CANDIDATO_ID });

    const arg = mocks.db.empresaCandidataFornecedor.findUnique.mock.calls[0]![0];
    expect(arg.include).toBeUndefined();
    expect(arg.select).toBeDefined();
    expect(arg.select.categoriaSugerida).toBe(true);
  });
});
