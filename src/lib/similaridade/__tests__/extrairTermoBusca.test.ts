import { describe, it, expect } from "vitest";
import { extrairTermoBusca, resolverTermoBusca } from "../extrairTermoBusca";

describe("extrairTermoBusca", () => {
  it("usa o trecho inicial da descrição sem stopwords, limitado a 5 palavras", () => {
    const termo = extrairTermoBusca(
      "Caneta esferográfica de tinta azul, escrita fina (0.7mm)",
    );
    expect(termo).toBe("Caneta esferográfica tinta azul");
  });

  it("prioriza palavras-chave quando informadas", () => {
    expect(extrairTermoBusca("Qualquer descrição", ["caneta", "azul"])).toBe("caneta azul");
  });
});

describe("resolverTermoBusca", () => {
  it("prioriza as palavras-chave do item quando existem", () => {
    const termo = resolverTermoBusca({
      descricao: "Caneta esferográfica azul",
      palavrasChave: ["caneta", "escrita fina"],
      termoBuscaIA: "caneta esferográfica",
    });
    expect(termo).toBe("caneta escrita fina");
  });

  it("usa o termo gerado pela IA quando não há palavras-chave", () => {
    const termo = resolverTermoBusca({
      descricao: "Fornecimento e instalação de equipamento multifuncional",
      palavrasChave: [],
      termoBuscaIA: "impressora multifuncional laser",
    });
    expect(termo).toBe("impressora multifuncional laser");
  });

  it("cai no termo extraído da descrição quando a IA não gerou termo", () => {
    const termo = resolverTermoBusca({
      descricao: "Caneta esferográfica azul, escrita fina",
      palavrasChave: [],
      termoBuscaIA: "   ",
    });
    expect(termo).toBe("Caneta esferográfica azul");
  });
});
