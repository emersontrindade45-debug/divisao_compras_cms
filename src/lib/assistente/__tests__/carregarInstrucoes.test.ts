import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    instrucaoPesquisa: { findMany: vi.fn() },
    processo: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { carregarInstrucoes, categoriasAplicaveis } from "../carregarInstrucoes";
import { montarInstrucoesPesquisa } from "../instrucoes";

describe("categoriasAplicaveis", () => {
  it("casa a categoria que aparece no texto do processo", () => {
    expect(
      categoriasAplicaveis(
        ["mobiliário", "informática"],
        "Aquisição de mobiliário para as salas de comissão",
      ),
    ).toEqual(["mobiliário"]);
  });

  it("ignora diferença de caixa", () => {
    expect(categoriasAplicaveis(["Informática"], "compra de equipamento de INFORMÁTICA")).toEqual([
      "Informática",
    ]);
  });

  it("não casa nada quando a categoria não aparece", () => {
    expect(categoriasAplicaveis(["gêneros alimentícios"], "aquisição de cadeiras")).toEqual([]);
  });

  it("descarta categoria vazia em vez de casar com tudo", () => {
    // `"".includes` seria sempre verdadeiro: uma instrução com categoria em
    // branco passaria a valer para todos os processos.
    expect(categoriasAplicaveis(["", "   "], "qualquer objeto")).toEqual([]);
  });
});

describe("carregarInstrucoes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.instrucaoPesquisa.findMany.mockImplementation(
      async ({ where }: { where: { escopo: string } }) => {
        if (where.escopo === "global") {
          return [{ escopo: "global", categoria: null, conteudo: "Regra geral", ativo: true }];
        }
        if (where.escopo === "categoria") {
          return [
            { escopo: "categoria", categoria: "mobiliário", conteudo: "Regra móveis", ativo: true },
            { escopo: "categoria", categoria: "informática", conteudo: "Regra TI", ativo: true },
          ];
        }
        return [{ escopo: "processo", categoria: null, conteudo: "Regra do processo", ativo: true }];
      },
    );
    mocks.db.processo.findUnique.mockResolvedValue({
      objeto: "Aquisição de mobiliário",
      itens: [{ descricao: "Cadeira giratória", palavrasChave: ["cadeira"] }],
    });
  });

  it("na conversa global traz só as instruções globais", async () => {
    const instrucoes = await carregarInstrucoes(null);

    expect(instrucoes.map((i) => i.escopo)).toEqual(["global"]);
    expect(mocks.db.processo.findUnique).not.toHaveBeenCalled();
  });

  it("traz global + categoria casada + processo, e descarta a categoria que não casa", async () => {
    const instrucoes = await carregarInstrucoes("proc-1");

    expect(instrucoes.map((i) => i.conteudo)).toEqual([
      "Regra geral",
      "Regra móveis",
      "Regra do processo",
    ]);
  });

  it("filtra por ativo no banco, não em memória", async () => {
    await carregarInstrucoes("proc-1");

    for (const chamada of mocks.db.instrucaoPesquisa.findMany.mock.calls) {
      expect(chamada[0].where.ativo).toBe(true);
    }
  });

  it("compõe o bloco final na ordem geral → categoria → processo", async () => {
    const texto = montarInstrucoesPesquisa(await carregarInstrucoes("proc-1"));

    // A mais específica é a última que o modelo lê — é onde ela ganha peso.
    expect(texto.indexOf("Regra geral")).toBeLessThan(texto.indexOf("Regra móveis"));
    expect(texto.indexOf("Regra móveis")).toBeLessThan(texto.indexOf("Regra do processo"));
  });

  it("não quebra quando o processo referenciado não existe", async () => {
    mocks.db.processo.findUnique.mockResolvedValue(null);

    const instrucoes = await carregarInstrucoes("proc-inexistente");

    // Sem texto para casar, nenhuma categoria se aplica — mas global e processo continuam.
    expect(instrucoes.map((i) => i.escopo)).toEqual(["global", "processo"]);
  });
});
