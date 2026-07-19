import { describe, it, expect } from "vitest";
import { filtrarPorPalavrasChave } from "../filtroPalavrasChave";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

function candidato(fonteDescricao: string): CandidatoSimilaridade {
  return {
    tipoCandidato: "contratacao_publica",
    fonteDescricao,
    fonteOrgaoOuId: "Órgão Teste",
    valorUnitario: 100,
    dataReferencia: new Date(),
    unidade: "unidade",
    quantidade: 1,
  };
}

describe("filtrarPorPalavrasChave", () => {
  it("mantém apenas candidatos cuja descrição contém alguma palavra-chave", () => {
    const candidatos = [
      candidato("Cadeira ergonômica de escritório"),
      candidato("Fuzil calibre 5.56"),
      candidato("Notebook corporativo"),
    ];

    const resultado = filtrarPorPalavrasChave(candidatos, ["cadeira", "mobiliário"]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].fonteDescricao).toBe("Cadeira ergonômica de escritório");
  });

  it("ignora acentuação e caixa ao comparar", () => {
    const candidatos = [candidato("CADEIRA ERGONÔMICA")];
    const resultado = filtrarPorPalavrasChave(candidatos, ["ergonomica"]);
    expect(resultado).toHaveLength(1);
  });

  it("retorna a lista original quando não há palavras-chave", () => {
    const candidatos = [candidato("Qualquer coisa")];
    expect(filtrarPorPalavrasChave(candidatos, [])).toEqual(candidatos);
  });

  it("retorna lista vazia quando nenhum candidato bate com as palavras-chave", () => {
    const candidatos = [candidato("Fuzil calibre 5.56")];
    expect(filtrarPorPalavrasChave(candidatos, ["cadeira"])).toEqual([]);
  });

  it("exige a palavra-núcleo (primeiro termo); os demais termos sozinhos não bastam", () => {
    const candidatos = [
      candidato("Caneta esferográfica azul"),
      candidato("Borracha azul escolar"),
    ];

    const resultado = filtrarPorPalavrasChave(candidatos, ["caneta", "azul", "escrita"]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].fonteDescricao).toBe("Caneta esferográfica azul");
  });

  it("casa o núcleo como palavra inteira, não como substring", () => {
    const candidatos = [
      candidato("Cola branca 90g"),
      candidato("Material escolar diverso"),
      candidato("Colagem artística em tela"),
    ];

    const resultado = filtrarPorPalavrasChave(candidatos, ["cola"]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].fonteDescricao).toBe("Cola branca 90g");
  });

  it("tolera plural simples ao casar o núcleo", () => {
    const candidatos = [candidato("Canetas esferográficas pretas")];
    expect(filtrarPorPalavrasChave(candidatos, ["caneta"])).toHaveLength(1);
  });
});
