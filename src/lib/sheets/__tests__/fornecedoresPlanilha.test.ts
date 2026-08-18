import { describe, it, expect } from "vitest";
import { encontrarCabecalho, parseFornecedoresPlanilha } from "../fornecedoresPlanilha";

// Cabeçalho real da planilha de fornecedores (ordem exata das colunas).
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

describe("encontrarCabecalho", () => {
  it("localiza o cabeçalho real da planilha e mapeia todas as colunas relevantes", () => {
    const rows = [CABECALHO];
    const resultado = encontrarCabecalho(rows);
    expect(resultado).not.toBeNull();
    expect(resultado!.indiceLinha).toBe(0);
    expect(resultado!.colunas).toMatchObject({
      linhaId: 0,
      categoria: 1,
      razaoSocial: 2,
      cnpj: 3,
      telefone: 4,
      telefone2: 5,
      email: 6,
      contato: 7,
      cidade: 8,
      estado: 9,
      fonte: 11,
    });
  });

  it("ignora explicitamente as colunas de acompanhamento de cotação", () => {
    const rows = [CABECALHO];
    const resultado = encontrarCabecalho(rows);
    const indicesMapeados = Object.values(resultado!.colunas);
    // "Situação" (10), "Processos Cotação" (12), "Respondeu?" (13), "Enviou Orçamento?" (14)
    // não podem aparecer em nenhum campo do mapa de colunas.
    expect(indicesMapeados).not.toContain(10);
    expect(indicesMapeados).not.toContain(12);
    expect(indicesMapeados).not.toContain(13);
    expect(indicesMapeados).not.toContain(14);
  });

  it("localiza o cabeçalho mesmo com colunas em ordem diferente (E-mail antes de CNPJ)", () => {
    const rows = [["#", "Nome/Razão Social", "E-mail", "CPF/CNPJ", "Município", "UF"]];
    const resultado = encontrarCabecalho(rows);
    expect(resultado).not.toBeNull();
    expect(resultado!.colunas).toMatchObject({
      linhaId: 0,
      razaoSocial: 1,
      email: 2,
      cnpj: 3,
      cidade: 4,
      estado: 5,
    });
  });

  it('reconhece "CNPJ" (sem "CPF/") como alias da coluna de CNPJ', () => {
    const rows = [["#", "Nome/Razão Social", "CNPJ", "E-mail"]];
    const resultado = encontrarCabecalho(rows);
    expect(resultado).not.toBeNull();
    expect(resultado!.colunas.cnpj).toBe(2);
  });

  it("retorna null quando nenhuma das primeiras linhas tem coluna de CNPJ", () => {
    const rows = [
      ["algum título"],
      ["outra linha qualquer"],
      ["Nome", "Telefone", "E-mail"],
    ];
    expect(encontrarCabecalho(rows)).toBeNull();
  });
});

describe("parseFornecedoresPlanilha", () => {
  it("retorna vazio quando não há cabeçalho reconhecível", () => {
    const resultado = parseFornecedoresPlanilha([["nada aqui"]]);
    expect(resultado.linhas).toEqual([]);
    expect(resultado.rejeitadas).toEqual([]);
  });

  it("CASA CATALAN: sem CNPJ, e-mail com ; final, sem tags", () => {
    const rows = [
      CABECALHO,
      [
        "1",
        "",
        "CASA CATALAN (JOBI)",
        "",
        "(13) 3356 1221",
        "",
        "VENDAS@CASACATALAN.COM.BR;",
        "CAROL",
        "",
        "",
        "",
        "Quadro Geral",
        "",
        "",
        "",
      ],
    ];
    const { linhas, rejeitadas } = parseFornecedoresPlanilha(rows);
    expect(rejeitadas).toEqual([]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      linhaId: "1",
      cnpj: null,
      razaoSocial: "CASA CATALAN (JOBI)",
      email: "vendas@casacatalan.com.br",
      emailsAdicionais: [],
      categoria: [],
      responsavelContato: "CAROL",
      fonte: "Quadro Geral",
    });
  });

  it("REIKI: CNPJ sem máscara vira XX.XXX.XXX/XXXX-XX", () => {
    const rows = [
      CABECALHO,
      [
        "7",
        "",
        "REIKI",
        "04261936000127",
        "(11) 5843-4040",
        "",
        "reikicomercio.servicos@gmail.com;",
        "",
        "",
        "",
        "",
        "Quadro Geral",
        "",
        "",
        "",
      ],
    ];
    const { linhas } = parseFornecedoresPlanilha(rows);
    expect(linhas[0]!.cnpj).toBe("04.261.936/0001-27");
  });

  it("BALI COMERCIAL: 2 e-mails na mesma célula", () => {
    const rows = [
      CABECALHO,
      [
        "10",
        "",
        "BALI COMERCIAL",
        "",
        "",
        "",
        "bali@balicomercial.com.br;eliana@balicomercial.com.br;",
        "",
        "",
        "",
        "",
        "Quadro Geral",
        "",
        "",
        "",
      ],
    ];
    const { linhas } = parseFornecedoresPlanilha(rows);
    expect(linhas[0]!.email).toBe("bali@balicomercial.com.br");
    expect(linhas[0]!.emailsAdicionais).toEqual(["eliana@balicomercial.com.br"]);
  });

  it('GF MÓVEIS: Tags "móveis, papelaria" vira categoria com 2 itens', () => {
    const rows = [
      CABECALHO,
      [
        "21",
        "móveis, papelaria",
        "GF MÓVEIS DE ESCRITÓRIO LTDA",
        "",
        "(35) 9834-8425",
        "",
        "gfmoveispassos@hotmail.com;",
        "",
        "",
        "",
        "",
        "Quadro Geral",
        "",
        "",
        "",
      ],
    ];
    const { linhas } = parseFornecedoresPlanilha(rows);
    expect(linhas[0]!.categoria).toEqual(["móveis", "papelaria"]);
  });

  it("deduplica e-mail repetido na mesma célula", () => {
    const rows = [
      CABECALHO,
      [
        "30",
        "",
        "GL TECH",
        "",
        "",
        "",
        "vendas.gltech@gmail.com;vendas.gltech@gmail.com;",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
    ];
    const { linhas } = parseFornecedoresPlanilha(rows);
    expect(linhas[0]!.email).toBe("vendas.gltech@gmail.com");
    expect(linhas[0]!.emailsAdicionais).toEqual([]);
    // Verificado manualmente por mutação (CLAUDE.md §9.35/§9.53): comentando a
    // checagem `if (vistos.has(email)) continue;` em `parseEmails`
    // (src/lib/sheets/fornecedoresPlanilha.ts), este teste passa a falhar —
    // `emailsAdicionais` sai `["vendas.gltech@gmail.com"]` em vez de `[]`. A
    // mutação foi desfeita em seguida; não fica no código final.
  });

  it("linha com razão social vazia no meio do lote é rejeitada sem afetar as demais", () => {
    const rows = [
      CABECALHO,
      [
        "1",
        "",
        "FORNECEDOR VÁLIDO 1",
        "",
        "",
        "",
        "valido1@exemplo.com",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      ["2", "", "", "", "", "", "semrazao@exemplo.com", "", "", "", "", "", "", "", ""],
      [
        "3",
        "",
        "FORNECEDOR VÁLIDO 2",
        "",
        "",
        "",
        "valido2@exemplo.com",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
    ];
    const { linhas, rejeitadas } = parseFornecedoresPlanilha(rows);
    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => l.razaoSocial)).toEqual([
      "FORNECEDOR VÁLIDO 1",
      "FORNECEDOR VÁLIDO 2",
    ]);
    expect(rejeitadas).toHaveLength(1);
    expect(rejeitadas[0]!.motivo).toBe("razão social vazia");
  });

  it("rejeita linha sem identificador de linha (#), sem travar o restante", () => {
    const rows = [
      CABECALHO,
      ["", "", "SEM NUMERO", "", "", "", "semnumero@exemplo.com", "", "", "", "", "", "", "", ""],
      [
        "5",
        "",
        "COM NUMERO",
        "",
        "",
        "",
        "comnumero@exemplo.com",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
    ];
    const { linhas, rejeitadas } = parseFornecedoresPlanilha(rows);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.razaoSocial).toBe("COM NUMERO");
    expect(rejeitadas).toHaveLength(1);
    expect(rejeitadas[0]!.motivo).toBe("sem identificador de linha (#)");
  });

  it("ignora linhas totalmente vazias sem gerar entrada em linhas ou rejeitadas", () => {
    const rows = [
      CABECALHO,
      [
        "1",
        "",
        "FORNECEDOR X",
        "",
        "",
        "",
        "x@exemplo.com",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      [],
    ];
    const { linhas, rejeitadas } = parseFornecedoresPlanilha(rows);
    expect(linhas).toHaveLength(1);
    expect(rejeitadas).toEqual([]);
  });

  it("telefone: usa Telefone, cai para Telefone 2, concatena se ambos preenchidos", () => {
    const rows = [
      CABECALHO,
      [
        "1",
        "",
        "SO TEL 1",
        "",
        "(13) 1111-1111",
        "",
        "tel1@exemplo.com",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      [
        "2",
        "",
        "SO TEL 2",
        "",
        "",
        "(13) 2222-2222",
        "tel2@exemplo.com",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      [
        "3",
        "",
        "AMBOS TEL",
        "",
        "(13) 3333-3333",
        "(13) 4444-4444",
        "ambos@exemplo.com",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      [
        "4",
        "",
        "SEM TEL",
        "",
        "",
        "",
        "semtel@exemplo.com",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
    ];
    const { linhas } = parseFornecedoresPlanilha(rows);
    expect(linhas[0]!.telefone).toBe("(13) 1111-1111");
    expect(linhas[1]!.telefone).toBe("(13) 2222-2222");
    expect(linhas[2]!.telefone).toBe("(13) 3333-3333 / (13) 4444-4444");
    expect(linhas[3]!.telefone).toBeUndefined();
  });
});
