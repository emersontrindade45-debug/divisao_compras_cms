import { describe, it, expect } from "vitest";
import { gerarAlertas, type AlertaInput } from "../alertas";

function inputVazio(): AlertaInput {
  return {
    cotacoesVencendo: [],
    processosSemFontePublica: [],
    cotacoesComPendenciaDocumental: [],
    itensComDispersao: [],
  };
}

function comCotacaoVencendo(diasRestantes: number): AlertaInput {
  return {
    ...inputVazio(),
    cotacoesVencendo: [
      {
        id: "cot1",
        processoId: "proc1",
        processoNumero: "2026/001",
        fornecedorNome: "Alfa Comércio Ltda",
        diasRestantes,
      },
    ],
  };
}

describe("gerarAlertas - input vazio", () => {
  it("retorna array vazio quando todas as coleções estão vazias", () => {
    expect(gerarAlertas(inputVazio())).toEqual([]);
  });
});

describe("gerarAlertas - cotações vencendo", () => {
  it("gera alerta crítico do tipo cotacao_vencida com diasRestantes negativo", () => {
    const [alerta] = gerarAlertas(comCotacaoVencendo(-1));
    expect(alerta.tipo).toBe("cotacao_vencida");
    expect(alerta.severidade).toBe("critico");
  });

  it("usa valor absoluto dos dias na mensagem de cotação vencida", () => {
    const [alerta] = gerarAlertas(comCotacaoVencendo(-3));
    expect(alerta.mensagem).toContain("venceu há 3 dia(s)");
    expect(alerta.mensagem).not.toContain("-3");
  });

  it("gera aviso do tipo cotacao_vencendo no limite diasRestantes = 0", () => {
    const [alerta] = gerarAlertas(comCotacaoVencendo(0));
    expect(alerta.tipo).toBe("cotacao_vencendo");
    expect(alerta.severidade).toBe("aviso");
    expect(alerta.mensagem).toContain("vence em 0 dia(s)");
  });

  it("gera aviso do tipo cotacao_vencendo no limite diasRestantes = 1", () => {
    const [alerta] = gerarAlertas(comCotacaoVencendo(1));
    expect(alerta.tipo).toBe("cotacao_vencendo");
    expect(alerta.severidade).toBe("aviso");
  });

  it("gera info do tipo cotacao_vencendo a partir de diasRestantes = 2", () => {
    const [alerta] = gerarAlertas(comCotacaoVencendo(2));
    expect(alerta.tipo).toBe("cotacao_vencendo");
    expect(alerta.severidade).toBe("info");
  });

  it("mantém severidade info para prazos folgados", () => {
    const [alerta] = gerarAlertas(comCotacaoVencendo(10));
    expect(alerta.severidade).toBe("info");
  });

  it("preenche id, href e campos de vínculo da cotação", () => {
    const [alerta] = gerarAlertas(comCotacaoVencendo(1));
    expect(alerta.id).toBe("cotacao-cot1");
    expect(alerta.href).toBe("/cotacoes");
    expect(alerta.processoId).toBe("proc1");
    expect(alerta.processoNumero).toBe("2026/001");
    expect(alerta.cotacaoId).toBe("cot1");
  });

  it("cita fornecedor e processo na mensagem", () => {
    const [alerta] = gerarAlertas(comCotacaoVencendo(1));
    expect(alerta.mensagem).toContain("Alfa Comércio Ltda");
    expect(alerta.mensagem).toContain("2026/001");
  });

  it("gera um alerta por cotação da coleção", () => {
    const alertas = gerarAlertas({
      ...inputVazio(),
      cotacoesVencendo: [
        {
          id: "cot1",
          processoId: "proc1",
          processoNumero: "2026/001",
          fornecedorNome: "Alfa",
          diasRestantes: 1,
        },
        {
          id: "cot2",
          processoId: "proc2",
          processoNumero: "2026/002",
          fornecedorNome: "Beta",
          diasRestantes: 5,
        },
      ],
    });
    expect(alertas).toHaveLength(2);
    expect(alertas.map((a) => a.id)).toEqual(
      expect.arrayContaining(["cotacao-cot1", "cotacao-cot2"]),
    );
  });
});

describe("gerarAlertas - processos sem fonte pública", () => {
  const input: AlertaInput = {
    ...inputVazio(),
    processosSemFontePublica: [{ id: "proc9", numero: "2026/009" }],
  };

  it("gera aviso do tipo processo_sem_fonte_publica", () => {
    const [alerta] = gerarAlertas(input);
    expect(alerta.tipo).toBe("processo_sem_fonte_publica");
    expect(alerta.severidade).toBe("aviso");
  });

  it("preenche id, href e vínculo com o processo", () => {
    const [alerta] = gerarAlertas(input);
    expect(alerta.id).toBe("sem-fonte-proc9");
    expect(alerta.href).toBe("/processos/proc9");
    expect(alerta.processoId).toBe("proc9");
    expect(alerta.processoNumero).toBe("2026/009");
  });

  it("cita a IN 65/2021 na mensagem (requisito de conformidade)", () => {
    const [alerta] = gerarAlertas(input);
    expect(alerta.mensagem).toContain("IN 65/2021");
    expect(alerta.mensagem).toContain("2026/009");
  });

  it("não vincula cotacaoId", () => {
    const [alerta] = gerarAlertas(input);
    expect(alerta.cotacaoId).toBeUndefined();
  });
});

describe("gerarAlertas - pendência documental", () => {
  const input: AlertaInput = {
    ...inputVazio(),
    cotacoesComPendenciaDocumental: [
      {
        id: "cot7",
        processoId: "proc7",
        processoNumero: "2026/007",
        fornecedorNome: "Gama Suprimentos",
      },
    ],
  };

  it("gera aviso do tipo pendencia_documental", () => {
    const [alerta] = gerarAlertas(input);
    expect(alerta.tipo).toBe("pendencia_documental");
    expect(alerta.severidade).toBe("aviso");
  });

  it("preenche id, href e campos de vínculo", () => {
    const [alerta] = gerarAlertas(input);
    expect(alerta.id).toBe("pendencia-cot7");
    expect(alerta.href).toBe("/cotacoes");
    expect(alerta.processoId).toBe("proc7");
    expect(alerta.processoNumero).toBe("2026/007");
    expect(alerta.cotacaoId).toBe("cot7");
  });

  it("cita fornecedor e processo na mensagem", () => {
    const [alerta] = gerarAlertas(input);
    expect(alerta.mensagem).toContain("Gama Suprimentos");
    expect(alerta.mensagem).toContain("2026/007");
    expect(alerta.mensagem).toContain("pendência documental");
  });
});

describe("gerarAlertas - dispersão de preço", () => {
  const input: AlertaInput = {
    ...inputVazio(),
    itensComDispersao: [
      {
        seriePrecoId: "serie1",
        itemId: "item1",
        processoId: "proc3",
        processoNumero: "2026/003",
        itemDescricao: "Papel A4 75g",
        coeficienteVariacao: 42.567,
      },
    ],
  };

  it("gera aviso do tipo dispersao_preco", () => {
    const [alerta] = gerarAlertas(input);
    expect(alerta.tipo).toBe("dispersao_preco");
    expect(alerta.severidade).toBe("aviso");
  });

  it("compõe o id a partir do id da série de preço, não de texto livre", () => {
    const [alerta] = gerarAlertas(input);
    expect(alerta.id).toBe("dispersao-serie1");
    expect(alerta.id).not.toContain("Papel A4 75g");
  });

  it("preenche href e vínculo com o processo, sem cotacaoId", () => {
    const [alerta] = gerarAlertas(input);
    expect(alerta.href).toBe("/processos/proc3");
    expect(alerta.processoId).toBe("proc3");
    expect(alerta.processoNumero).toBe("2026/003");
    expect(alerta.cotacaoId).toBeUndefined();
  });

  it("formata o coeficiente de variação com uma casa decimal", () => {
    const [alerta] = gerarAlertas(input);
    expect(alerta.mensagem).toContain("CV de 42.6%");
  });

  it("formata CV inteiro com a casa decimal explícita", () => {
    const [alerta] = gerarAlertas({
      ...inputVazio(),
      itensComDispersao: [
        {
          seriePrecoId: "serie2",
          itemId: "item2",
          processoId: "proc3",
          processoNumero: "2026/003",
          itemDescricao: "Toner",
          coeficienteVariacao: 35,
        },
      ],
    });
    expect(alerta.mensagem).toContain("CV de 35.0%");
  });

  it("exige análise crítica na mensagem (requisito de conformidade)", () => {
    const [alerta] = gerarAlertas(input);
    expect(alerta.mensagem).toContain("exige análise crítica");
    expect(alerta.mensagem).toContain('"Papel A4 75g"');
  });

  // Regressão: o id do alerta é a chave de dispensa em AlertasBanner. Quando era
  // derivado de `itemDescricao` (texto livre, sem unicidade no schema), dois itens
  // homônimos do mesmo processo colidiam e dispensar um escondia o outro —
  // suprimindo da tela um item que exige análise crítica pela IN 65/2021.
  it("gera ids distintos para itens homônimos do mesmo processo", () => {
    const alertas = gerarAlertas({
      ...inputVazio(),
      itensComDispersao: [
        {
          seriePrecoId: "serie-a",
          itemId: "item-a",
          processoId: "proc7",
          processoNumero: "2026/007",
          itemDescricao: "Papel A4 75g",
          coeficienteVariacao: 30,
        },
        {
          seriePrecoId: "serie-b",
          itemId: "item-b",
          processoId: "proc7",
          processoNumero: "2026/007",
          itemDescricao: "Papel A4 75g",
          coeficienteVariacao: 45,
        },
      ],
    });

    expect(alertas).toHaveLength(2);
    expect(new Set(alertas.map((a) => a.id)).size).toBe(2);
  });

  // Um Item pode ter mais de uma SeriePreco (relação 1-N no schema), então o id
  // do item também não basta como identidade da linha de alerta.
  it("gera ids distintos para séries diferentes do mesmo item", () => {
    const alertas = gerarAlertas({
      ...inputVazio(),
      itensComDispersao: [
        {
          seriePrecoId: "serie-x",
          itemId: "item-unico",
          processoId: "proc8",
          processoNumero: "2026/008",
          itemDescricao: "Cadeira",
          coeficienteVariacao: 28,
        },
        {
          seriePrecoId: "serie-y",
          itemId: "item-unico",
          processoId: "proc8",
          processoNumero: "2026/008",
          itemDescricao: "Cadeira",
          coeficienteVariacao: 61,
        },
      ],
    });

    expect(alertas).toHaveLength(2);
    expect(new Set(alertas.map((a) => a.id)).size).toBe(2);
  });
});

describe("gerarAlertas - ordenação por severidade", () => {
  const inputMisto: AlertaInput = {
    cotacoesVencendo: [
      {
        id: "cot-info",
        processoId: "proc1",
        processoNumero: "2026/001",
        fornecedorNome: "Alfa",
        diasRestantes: 5,
      },
      {
        id: "cot-critico",
        processoId: "proc2",
        processoNumero: "2026/002",
        fornecedorNome: "Beta",
        diasRestantes: -2,
      },
      {
        id: "cot-aviso",
        processoId: "proc3",
        processoNumero: "2026/003",
        fornecedorNome: "Gama",
        diasRestantes: 1,
      },
    ],
    processosSemFontePublica: [{ id: "proc4", numero: "2026/004" }],
    cotacoesComPendenciaDocumental: [
      {
        id: "cot5",
        processoId: "proc5",
        processoNumero: "2026/005",
        fornecedorNome: "Delta",
      },
    ],
    itensComDispersao: [
      {
        seriePrecoId: "serie6",
        itemId: "item6",
        processoId: "proc6",
        processoNumero: "2026/006",
        itemDescricao: "Cadeira",
        coeficienteVariacao: 50,
      },
    ],
  };

  it("agrega alertas de todas as categorias", () => {
    expect(gerarAlertas(inputMisto)).toHaveLength(6);
  });

  it("ordena críticos primeiro, depois avisos, depois infos", () => {
    const severidades = gerarAlertas(inputMisto).map((a) => a.severidade);
    expect(severidades).toEqual([
      "critico",
      "aviso",
      "aviso",
      "aviso",
      "aviso",
      "info",
    ]);
  });

  it("coloca a cotação vencida no topo e a informativa no fim", () => {
    const alertas = gerarAlertas(inputMisto);
    expect(alertas[0].id).toBe("cotacao-cot-critico");
    expect(alertas[alertas.length - 1].id).toBe("cotacao-cot-info");
  });

  it("não descarta nenhum alerta ao ordenar", () => {
    const ids = gerarAlertas(inputMisto).map((a) => a.id);
    expect(new Set(ids).size).toBe(6);
  });
});
