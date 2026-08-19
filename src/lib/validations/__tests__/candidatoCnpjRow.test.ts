import { describe, it, expect } from "vitest";
import { linhaCandidatoCnpjSchema } from "@/lib/validations/candidatoCnpjRow";

function linhaValida(overrides: Partial<Record<string, string>> = {}) {
  return {
    cnpj: "12345678000195",
    razaoSocial: "Empresa Exemplo Ltda",
    nomeFantasia: "Exemplo",
    situacaoCadastral: "02",
    situacaoCadastralData: "20200115",
    municipio: "SAO VICENTE",
    estado: "SP",
    cnaePrincipalCodigo: "4711302",
    cnaePrincipalDescricao: "Comércio varejista",
    email: "contato@exemplo.com",
    telefone: "1332211122",
    logradouro: "Rua das Flores",
    numero: "100",
    bairro: "Centro",
    cep: "11310000",
    ...overrides,
  };
}

describe("linhaCandidatoCnpjSchema", () => {
  it("aceita linha válida com CNPJ ativo", () => {
    const result = linhaCandidatoCnpjSchema.safeParse(linhaValida());
    expect(result.success).toBe(true);
  });

  it("rejeita CNPJ mascarado (o CSV da Receita não deve trazer máscara)", () => {
    const result = linhaCandidatoCnpjSchema.safeParse(
      linhaValida({ cnpj: "12.345.678/0001-95" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita CNPJ com menos de 14 dígitos", () => {
    const result = linhaCandidatoCnpjSchema.safeParse(linhaValida({ cnpj: "123456780001" }));
    expect(result.success).toBe(false);
  });

  it("rejeita situação cadastral diferente de ativa (02), defesa em profundidade", () => {
    const result = linhaCandidatoCnpjSchema.safeParse(linhaValida({ situacaoCadastral: "08" }));
    expect(result.success).toBe(false);
  });

  it("rejeita razão social vazia", () => {
    const result = linhaCandidatoCnpjSchema.safeParse(linhaValida({ razaoSocial: "" }));
    expect(result.success).toBe(false);
  });

  it("rejeita município vazio", () => {
    const result = linhaCandidatoCnpjSchema.safeParse(linhaValida({ municipio: "" }));
    expect(result.success).toBe(false);
  });

  it("rejeita estado que não tenha 2 letras", () => {
    const result = linhaCandidatoCnpjSchema.safeParse(linhaValida({ estado: "São Paulo" }));
    expect(result.success).toBe(false);
  });

  it("rejeita CNAE principal vazio", () => {
    const result = linhaCandidatoCnpjSchema.safeParse(
      linhaValida({ cnaePrincipalCodigo: "", cnaePrincipalDescricao: "" }),
    );
    expect(result.success).toBe(false);
  });

  it("aceita campos opcionais vazios (nomeFantasia, email, telefone, endereço)", () => {
    const result = linhaCandidatoCnpjSchema.safeParse(
      linhaValida({
        nomeFantasia: "",
        email: "",
        telefone: "",
        logradouro: "",
        numero: "",
        bairro: "",
        cep: "",
        situacaoCadastralData: "",
      }),
    );
    expect(result.success).toBe(true);
  });
});
