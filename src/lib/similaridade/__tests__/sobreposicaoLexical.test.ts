import { describe, it, expect } from "vitest";
import { ordenarPorSobreposicaoLexical } from "../sobreposicaoLexical";
import type { CandidatoSimilaridade, ItemExtraidoTR } from "@/lib/ia/types";

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

const itemTR: ItemExtraidoTR = {
  descricao: "Caneta esferográfica azul",
  especificacaoTecnica: "Escrita fina 0.7mm, corpo sextavado",
  unidade: "unidade",
  quantidade: 100,
};

describe("ordenarPorSobreposicaoLexical", () => {
  it("coloca candidatos com mais palavras em comum com o item antes dos demais", () => {
    const candidatos = [
      candidato("Grampeador de mesa metálico"),
      candidato("Caneta esferográfica azul escrita fina"),
      candidato("Caneta hidrográfica"),
    ];

    const resultado = ordenarPorSobreposicaoLexical(itemTR, candidatos);

    expect(resultado.map((c) => c.fonteDescricao)).toEqual([
      "Caneta esferográfica azul escrita fina",
      "Caneta hidrográfica",
      "Grampeador de mesa metálico",
    ]);
  });

  it("ignora acentuação, caixa e plural na sobreposição", () => {
    const candidatos = [
      candidato("Livro didático"),
      candidato("CANETAS ESFEROGRAFICAS AZUIS"),
    ];

    const resultado = ordenarPorSobreposicaoLexical(itemTR, candidatos);

    expect(resultado[0].fonteDescricao).toBe("CANETAS ESFEROGRAFICAS AZUIS");
  });

  it("preserva a ordem original em caso de empate", () => {
    const candidatos = [candidato("Régua 30cm"), candidato("Tesoura escolar")];
    expect(ordenarPorSobreposicaoLexical(itemTR, candidatos)).toEqual(candidatos);
  });
});
