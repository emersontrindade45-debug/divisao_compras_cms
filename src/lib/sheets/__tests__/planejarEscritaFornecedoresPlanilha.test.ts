import { describe, expect, it } from "vitest";
import { letraColuna, rangeA1, rangeAba } from "../colunaA1";
import {
  planejarEscritaFornecedoresPlanilha,
  type FornecedorParaPlanilha,
} from "../planejarEscritaFornecedoresPlanilha";

const CABECALHO = [
  "#",
  "Tags",
  "Nome/Razão Social",
  "CPF/CNPJ",
  "Telefone",
  "Telefone 2",
  "E-mail",
  "Contato",
  "Município",
  "UF",
  "Situação",
  "Fonte",
  "Processos Cotação",
  "Respondeu?",
  "Enviou Orçamento?",
];

function linhaPlanilha(
  parcial: Partial<{
    linhaId: string;
    tags: string;
    razaoSocial: string;
    cnpj: string;
    telefone: string;
    telefone2: string;
    email: string;
    contato: string;
    cidade: string;
    estado: string;
  }> = {},
): string[] {
  const row = Array.from({ length: CABECALHO.length }, () => "");
  row[0] = parcial.linhaId ?? "1";
  row[1] = parcial.tags ?? "";
  row[2] = parcial.razaoSocial ?? "EMPRESA EXEMPLO LTDA";
  row[3] = parcial.cnpj ?? "";
  row[4] = parcial.telefone ?? "";
  row[5] = parcial.telefone2 ?? "";
  row[6] = parcial.email ?? "";
  row[7] = parcial.contato ?? "";
  row[8] = parcial.cidade ?? "";
  row[9] = parcial.estado ?? "";
  return row;
}

function fornecedor(parcial: Partial<FornecedorParaPlanilha> = {}): FornecedorParaPlanilha {
  return {
    origemPlanilhaLinhaId: "1",
    razaoSocial: "EMPRESA EXEMPLO LTDA",
    categoria: [],
    cidade: "",
    estado: "",
    email: "",
    emailsAdicionais: [],
    telefone: null,
    ...parcial,
  };
}

function campos(atualizacoes: { campo: string }[]): string[] {
  return atualizacoes.map((a) => a.campo);
}

describe("letraColuna", () => {
  it("converte índice 0-based em letra A1", () => {
    expect(letraColuna(0)).toBe("A");
    expect(letraColuna(25)).toBe("Z");
    expect(letraColuna(26)).toBe("AA");
    expect(letraColuna(27)).toBe("AB");
  });

  it("monta range A1 escapando aspas no título da aba", () => {
    expect(rangeA1("Fornecedores", 8, 12)).toBe("'Fornecedores'!I12");
    expect(rangeAba("Fornecedores", "A:Z")).toBe("'Fornecedores'!A:Z");
    expect(rangeA1("Aba do 'user'", 0, 1)).toBe("'Aba do ''user'''!A1");
  });
});

describe("planejarEscritaFornecedoresPlanilha", () => {
  it("devolve plano vazio quando não encontra o cabeçalho", () => {
    const plano = planejarEscritaFornecedoresPlanilha(
      [["título qualquer"], ["outra linha"]],
      [fornecedor({ cidade: "Santos" })],
    );
    expect(plano.atualizacoes).toEqual([]);
    expect(plano.resumo.celulasAPreencher).toBe(0);
  });

  it("preenche Município vazio com a cidade do banco", () => {
    const plano = planejarEscritaFornecedoresPlanilha(
      [CABECALHO, linhaPlanilha({ cidade: "" })],
      [fornecedor({ cidade: "São Vicente" })],
    );
    expect(plano.atualizacoes).toEqual([
      expect.objectContaining({
        linhaId: "1",
        campo: "cidade",
        coluna: 8,
        linhaPlanilha: 2,
        valorAnterior: "",
        valorNovo: "São Vicente",
      }),
    ]);
  });

  it("não sobrescreve Município já preenchido, mesmo se o banco tiver outro valor", () => {
    const plano = planejarEscritaFornecedoresPlanilha(
      [CABECALHO, linhaPlanilha({ cidade: "Santos" })],
      [fornecedor({ cidade: "São Vicente" })],
    );
    expect(campos(plano.atualizacoes)).not.toContain("cidade");
  });

  it("preenche UF vazia e deixa UF já preenchida em paz", () => {
    const plano = planejarEscritaFornecedoresPlanilha(
      [
        CABECALHO,
        linhaPlanilha({ linhaId: "1", estado: "" }),
        linhaPlanilha({ linhaId: "2", estado: "RJ" }),
      ],
      [
        fornecedor({ origemPlanilhaLinhaId: "1", estado: "SP" }),
        fornecedor({ origemPlanilhaLinhaId: "2", estado: "SP" }),
      ],
    );
    const ufs = plano.atualizacoes.filter((a) => a.campo === "estado");
    expect(ufs).toEqual([expect.objectContaining({ linhaId: "1", valorNovo: "SP" })]);
  });

  it("preenche E-mail vazio juntando email principal e adicionais; não toca e-mail já preenchido", () => {
    const plano = planejarEscritaFornecedoresPlanilha(
      [
        CABECALHO,
        linhaPlanilha({ linhaId: "1", email: "" }),
        linhaPlanilha({ linhaId: "2", email: "ja@tem.com" }),
      ],
      [
        fornecedor({
          origemPlanilhaLinhaId: "1",
          email: "a@x.com",
          emailsAdicionais: ["b@x.com", "a@x.com"],
        }),
        fornecedor({
          origemPlanilhaLinhaId: "2",
          email: "outro@x.com",
        }),
      ],
    );
    const emails = plano.atualizacoes.filter((a) => a.campo === "email");
    expect(emails).toEqual([
      expect.objectContaining({ linhaId: "1", valorNovo: "a@x.com; b@x.com" }),
    ]);
  });

  it("preenche Telefone só quando as duas colunas de telefone estão vazias", () => {
    const plano = planejarEscritaFornecedoresPlanilha(
      [
        CABECALHO,
        linhaPlanilha({ linhaId: "1", telefone: "", telefone2: "" }),
        linhaPlanilha({ linhaId: "2", telefone: "(13) 3000-0000", telefone2: "" }),
        linhaPlanilha({ linhaId: "3", telefone: "", telefone2: "(13) 4000-0000" }),
      ],
      [
        fornecedor({ origemPlanilhaLinhaId: "1", telefone: "(13) 3222-1111" }),
        fornecedor({ origemPlanilhaLinhaId: "2", telefone: "(13) 3222-2222" }),
        fornecedor({ origemPlanilhaLinhaId: "3", telefone: "(13) 3222-3333" }),
      ],
    );
    const telefones = plano.atualizacoes.filter((a) => a.campo === "telefone");
    expect(telefones).toEqual([
      expect.objectContaining({
        linhaId: "1",
        coluna: 4,
        valorNovo: "(13) 3222-1111",
      }),
    ]);
  });

  it("preenche Tags vazias juntando categoria do banco; não mescla com Tags já preenchidas", () => {
    const plano = planejarEscritaFornecedoresPlanilha(
      [
        CABECALHO,
        linhaPlanilha({ linhaId: "1", tags: "" }),
        linhaPlanilha({ linhaId: "2", tags: "limpeza" }),
      ],
      [
        fornecedor({ origemPlanilhaLinhaId: "1", categoria: ["ferragens", "elétrico"] }),
        fornecedor({ origemPlanilhaLinhaId: "2", categoria: ["limpeza", "jardinagem"] }),
      ],
    );
    const tags = plano.atualizacoes.filter((a) => a.campo === "categoria");
    expect(tags).toEqual([
      expect.objectContaining({ linhaId: "1", valorNovo: "ferragens, elétrico" }),
    ]);
  });

  it("escreve razão social quando diverge após normalizar, mesmo com a célula preenchida", () => {
    const plano = planejarEscritaFornecedoresPlanilha(
      [CABECALHO, linhaPlanilha({ razaoSocial: "EMPRESA EXEMPLO LTDA" })],
      [fornecedor({ razaoSocial: "EMPRESA EXEMPLO LTDA EPP" })],
    );
    expect(plano.atualizacoes).toEqual([
      expect.objectContaining({
        campo: "razaoSocial",
        valorAnterior: "EMPRESA EXEMPLO LTDA",
        valorNovo: "EMPRESA EXEMPLO LTDA EPP",
      }),
    ]);
  });

  it("não escreve razão social quando só muda acento, caixa ou espaço", () => {
    const plano = planejarEscritaFornecedoresPlanilha(
      [CABECALHO, linhaPlanilha({ razaoSocial: "  Empresa Exemplo Ltda  " })],
      [fornecedor({ razaoSocial: "EMPRESA EXEMPLO LTDA" })],
    );
    expect(campos(plano.atualizacoes)).not.toContain("razaoSocial");
  });

  it("preenche razão social vazia (célula vazia, não exceção de divergência)", () => {
    const plano = planejarEscritaFornecedoresPlanilha(
      [CABECALHO, linhaPlanilha({ razaoSocial: "" })],
      [fornecedor({ razaoSocial: "EMPRESA EXEMPLO LTDA" })],
    );
    expect(plano.atualizacoes).toEqual([
      expect.objectContaining({
        campo: "razaoSocial",
        valorAnterior: "",
        valorNovo: "EMPRESA EXEMPLO LTDA",
      }),
    ]);
  });

  it("não escreve célula vazia quando o banco também está vazio", () => {
    const plano = planejarEscritaFornecedoresPlanilha([CABECALHO, linhaPlanilha()], [fornecedor()]);
    expect(plano.atualizacoes).toEqual([]);
  });

  it("ignora fornecedor cujo # não existe na planilha e conta o miss", () => {
    const plano = planejarEscritaFornecedoresPlanilha(
      [CABECALHO, linhaPlanilha({ linhaId: "10", cidade: "" })],
      [fornecedor({ origemPlanilhaLinhaId: "99", cidade: "Santos" })],
    );
    expect(plano.atualizacoes).toEqual([]);
    expect(plano.resumo.linhasBancoSemMatch).toBe(1);
    expect(plano.resumo.linhasCasadas).toBe(0);
  });

  it("casa pelo #, não pela posição da linha, e usa a primeira ocorrência em duplicata", () => {
    const plano = planejarEscritaFornecedoresPlanilha(
      [
        CABECALHO,
        linhaPlanilha({ linhaId: "7", cidade: "Santos" }),
        linhaPlanilha({ linhaId: "7", cidade: "" }),
      ],
      [fornecedor({ origemPlanilhaLinhaId: "7", cidade: "São Vicente" })],
    );
    expect(campos(plano.atualizacoes)).not.toContain("cidade");
    expect(plano.resumo.linhasCasadas).toBe(1);
  });
});
