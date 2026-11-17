import { describe, expect, it } from "vitest";
import { planejarItens, type ItemExistente } from "../planejarItens";

const item = (id: string, descricao: string, ordem: number | null, temTrabalho = false): ItemExistente => ({
  id,
  descricao,
  ordem,
  temTrabalho,
});

describe("planejarItens", () => {
  it("item que casa pela descrição é atualizado e ganha a ordem da planilha", () => {
    const plano = planejarItens([item("a", "Pintura", 5, true), item("b", "Limpeza", 6)], ["limpeza", "PINTURA"]);
    expect(plano.itens).toEqual([
      { acao: "atualizar", itemId: "b", ordem: 1 },
      { acao: "atualizar", itemId: "a", ordem: 2 },
    ]);
    expect(plano.apagar).toEqual([]);
    expect(plano.preservar).toEqual([]);
  });

  it("casa sem distinção de caixa e de acento", () => {
    const plano = planejarItens([item("a", "Descupinização", 1)], ["DESCUPINIZACAO"]);
    expect(plano.itens).toEqual([{ acao: "atualizar", itemId: "a", ordem: 1 }]);
  });

  it("item novo na planilha é criado com a posição dela", () => {
    const plano = planejarItens([item("a", "A", 1)], ["A", "B"]);
    expect(plano.itens[1]).toEqual({ acao: "criar", ordem: 2 });
  });

  it("item que saiu da planilha e NÃO tem trabalho ligado é apagado", () => {
    const plano = planejarItens([item("a", "A", 1), item("x", "Removido", 2, false)], ["A"]);
    expect(plano.apagar).toEqual(["x"]);
    expect(plano.preservar).toEqual([]);
  });

  it("descrição editada na MESMA posição, com candidatos: renomeia o item, não apaga", () => {
    // O caso do processo 05515/2026: a linha 1 mudou de texto e o item tinha preços adicionados.
    const plano = planejarItens(
      [item("antigo", "Controle de pragas A", 1, true), item("b", "B", 2)],
      ["Controle integrado de pragas A", "B"],
    );
    expect(plano.itens[0]).toEqual({ acao: "renomear", itemId: "antigo", ordem: 1 });
    expect(plano.apagar).toEqual([]);
    expect(plano.preservar).toEqual([]);
  });

  it("com trabalho ligado e sem par na mesma posição: preserva, nunca apaga", () => {
    const plano = planejarItens([item("a", "A", 1), item("so", "Saiu", 2, true)], ["A"]);
    expect(plano.apagar).toEqual([]);
    expect(plano.preservar).toEqual(["so"]);
  });

  it("item preservado sem ordem (sem posição) não é pareado por engano", () => {
    const plano = planejarItens([item("p", "Velho", null, true)], ["Novo"]);
    expect(plano.preservar).toEqual(["p"]);
    expect(plano.itens).toEqual([{ acao: "criar", ordem: 1 }]);
  });

  it("a posição pareada só vale para linha NOVA: linha que já casa outro item não é tomada", () => {
    const plano = planejarItens(
      [item("a", "A", 1), item("velho", "Velho", 1, true)],
      ["A"],
    );
    expect(plano.itens).toEqual([{ acao: "atualizar", itemId: "a", ordem: 1 }]);
    expect(plano.preservar).toEqual(["velho"]);
  });

  it("dois itens com trabalho não disputam a mesma linha nova", () => {
    const plano = planejarItens(
      [item("v1", "V1", 1, true), item("v2", "V2", 1, true)],
      ["Nova"],
    );
    expect(plano.itens[0]!.acao).toBe("renomear");
    expect(plano.preservar).toHaveLength(1);
  });
});
