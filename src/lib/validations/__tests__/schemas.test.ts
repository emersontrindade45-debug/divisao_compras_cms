import { describe, it, expect } from "vitest";
import {
  createProcessoSchema,
  createFornecedorSchema,
  createCotacaoSchema,
  createPropostaSchema,
  createPrecoConsolidadoSchema,
} from "@/lib/validations";

describe("createProcessoSchema", () => {
  it("aceita processo válido", () => {
    const input = {
      numero: "2026/001",
      objeto: "Aquisição de cadeiras ergonômicas",
      unidade: "unidade",
      quantidade: 40,
      caracteristicasTecnicas: "Encosto regulável, apoio lombar.",
      palavrasChave: ["cadeira", "ergonômica"],
      classificacao: "comum" as const,
      responsavel: "Ana Souza",
      dataAbertura: new Date("2026-02-10"),
    };
    const result = createProcessoSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejeita quantidade zero", () => {
    const input = {
      numero: "2026/001",
      objeto: "Objeto qualquer",
      unidade: "unidade",
      quantidade: 0,
      caracteristicasTecnicas: "Algo",
      palavrasChave: ["teste"],
      classificacao: "comum" as const,
      responsavel: "Fulano",
      dataAbertura: new Date(),
    };
    const result = createProcessoSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejeita sem palavras-chave", () => {
    const input = {
      numero: "2026/001",
      objeto: "Objeto qualquer",
      unidade: "unidade",
      quantidade: 10,
      caracteristicasTecnicas: "Algo",
      palavrasChave: [],
      classificacao: "comum" as const,
      responsavel: "Fulano",
      dataAbertura: new Date(),
    };
    const result = createProcessoSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("createFornecedorSchema", () => {
  it("aceita CNPJ no formato correto", () => {
    const input = {
      cnpj: "12.345.678/0001-90",
      razaoSocial: "Empresa Teste Ltda.",
      categoria: ["Informática"],
      cidade: "Santos",
      estado: "SP",
      responsavelContato: "João Silva",
      email: "joao@empresa.com.br",
    };
    const result = createFornecedorSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejeita CNPJ sem formatação", () => {
    const input = {
      cnpj: "12345678000190",
      razaoSocial: "Empresa Teste Ltda.",
      categoria: ["Informática"],
      cidade: "Santos",
      estado: "SP",
      responsavelContato: "João Silva",
      email: "joao@empresa.com.br",
    };
    const result = createFornecedorSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejeita e-mail inválido", () => {
    const input = {
      cnpj: "12.345.678/0001-90",
      razaoSocial: "Empresa Teste Ltda.",
      categoria: ["Informática"],
      cidade: "Santos",
      estado: "SP",
      responsavelContato: "João Silva",
      email: "nao-e-um-email",
    };
    const result = createFornecedorSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejeita estado com mais de 2 letras", () => {
    const input = {
      cnpj: "12.345.678/0001-90",
      razaoSocial: "Empresa Teste Ltda.",
      categoria: ["Informática"],
      cidade: "Santos",
      estado: "SPP",
      responsavelContato: "João Silva",
      email: "joao@empresa.com.br",
    };
    const result = createFornecedorSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("createCotacaoSchema", () => {
  it("aceita cotação válida", () => {
    const input = {
      processoId: "clxxxxxxxxxxxxxxxxxxxxxxxx",
      fornecedorId: "clxxxxxxxxxxxxxxxxxxxxxxxy",
      dataEnvio: new Date("2026-05-20"),
      dataLimite: new Date("2026-06-03"),
    };
    const result = createCotacaoSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejeita dataLimite anterior a dataEnvio", () => {
    const input = {
      processoId: "clxxxxxxxxxxxxxxxxxxxxxxxx",
      fornecedorId: "clxxxxxxxxxxxxxxxxxxxxxxxy",
      dataEnvio: new Date("2026-06-10"),
      dataLimite: new Date("2026-06-01"),
    };
    const result = createCotacaoSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("createPropostaSchema", () => {
  it("aceita proposta válida completa", () => {
    const input = {
      cotacaoId: "clxxxxxxxxxxxxxxxxxxxxxxxx",
      cnpjValido: "valido" as const,
      descricaoValida: "valido" as const,
      valorUnitarioValido: "valido" as const,
      valorTotalValido: "valido" as const,
      dataValida: "valido" as const,
      responsavelValido: "valido" as const,
      statusGeral: "valida" as const,
      valorUnitario: 1250.0,
      valorTotal: 50000.0,
    };
    const result = createPropostaSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejeita statusGeral inválido", () => {
    const input = {
      cotacaoId: "clxxxxxxxxxxxxxxxxxxxxxxxx",
      cnpjValido: "valido" as const,
      descricaoValida: "valido" as const,
      valorUnitarioValido: "valido" as const,
      valorTotalValido: "valido" as const,
      dataValida: "valido" as const,
      responsavelValido: "valido" as const,
      statusGeral: "aprovada" as unknown as "valida",
    };
    const result = createPropostaSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("createPrecoConsolidadoSchema", () => {
  it("aceita preço válido incluído", () => {
    const input = {
      seriePrecoId: "clxxxxxxxxxxxxxxxxxxxxxxxx",
      fonte: "contratacao_publica" as const,
      descricaoFonte: "Pregão 001/2026",
      fornecedorOuOrgao: "Tribunal XYZ",
      dataReferencia: new Date("2026-01-01"),
      valorUnitario: 1250.0,
      status: "incluido" as const,
    };
    const result = createPrecoConsolidadoSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejeita valor unitário zero ou negativo", () => {
    const input = {
      seriePrecoId: "clxxxxxxxxxxxxxxxxxxxxxxxx",
      fonte: "contratacao_publica" as const,
      descricaoFonte: "Pregão 001/2026",
      fornecedorOuOrgao: "Tribunal XYZ",
      dataReferencia: new Date("2026-01-01"),
      valorUnitario: 0,
    };
    const result = createPrecoConsolidadoSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejeita preço excluído sem motivo de exclusão", () => {
    const input = {
      seriePrecoId: "clxxxxxxxxxxxxxxxxxxxxxxxx",
      fonte: "contratacao_publica" as const,
      descricaoFonte: "Pregão 001/2026",
      fornecedorOuOrgao: "Tribunal XYZ",
      dataReferencia: new Date("2026-01-01"),
      valorUnitario: 1250.0,
      status: "excluido" as const,
    };
    const result = createPrecoConsolidadoSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
