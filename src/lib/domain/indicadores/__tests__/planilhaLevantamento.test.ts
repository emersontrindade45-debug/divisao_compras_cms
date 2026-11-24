import { describe, expect, it } from "vitest";
import {
  contarConsultas,
  SEM_PROCESSO,
  type ConsultaDesempenhoInput,
} from "../desempenho";
import {
  ABA_CONSULTAS,
  ABA_POR_MES,
  ABA_RESUMO,
  CELULA_CONFERENCIA,
  GRAVANDO,
  montarAbasPlanilha,
  primeiraDiferenca,
  rotuloDaRegra,
  type EntradaPlanilha,
  type LinhaConsultaPlanilha,
} from "../planilhaLevantamento";

const AGORA = new Date("2026-11-24T13:00:00Z"); // 10:00 em Brasília
const d = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

type Sit = ConsultaDesempenhoInput["situacao"];
const c = (situacao: Sit, envio: string, extra: Partial<ConsultaDesempenhoInput> = {}): ConsultaDesempenhoInput => ({
  dataEnvio: d(envio),
  dataResposta: situacao === "sem_resposta" || situacao === "email_invalido" ? null : d(envio),
  situacao,
  processo: SEM_PROCESSO,
  ...extra,
});

const linha = (situacao: string, regra: string | null, extra: Partial<LinhaConsultaPlanilha> = {}): LinhaConsultaPlanilha => ({
  envioGmailId: "env1",
  email: "a@x.com",
  situacao,
  regra,
  dataResposta: d("2026-03-10"),
  respostaGmailId: "msg1",
  ...extra,
});

/** Cenário: 12 consultas em 2 envios (jan e março) + 1 resposta sem fornecedor ligado. */
function cenario(sobre: Partial<EntradaPlanilha> = {}): EntradaPlanilha {
  const consultas: ConsultaDesempenhoInput[] = [
    c("orcamento", "2026-01-10"),
    c("orcamento", "2026-01-10"),
    c("recusa", "2026-01-10"),
    c("duvida", "2026-01-10"),
    c("a_confirmar", "2026-01-10"),
    c("sem_resposta", "2026-01-10"),
    c("email_invalido", "2026-01-10"),
    c("recusa", "2026-03-05"),
    c("sem_resposta", "2026-03-05"),
    c("sem_resposta", "2026-03-05"),
    c("sem_resposta", "2026-03-05"),
    c("email_invalido", "2026-03-05"),
    // resposta classificada pela IA sem fornecedor: soma no numerador do dashboard, fora da partição
    c("recusa", "2026-03-05", { semFornecedor: true }),
  ];
  return {
    ano: 2026,
    agora: AGORA,
    consultas,
    envios: [
      { dataEnvio: d("2026-01-10"), totalDestinatarios: 7 },
      { dataEnvio: d("2026-03-05"), totalDestinatarios: 5 },
    ],
    linhas: [
      linha("orcamento", "anexo_orcamento"),
      linha("orcamento", "ia"),
      linha("recusa", "manual"),
      linha("recusa", "frase_recusa"),
      linha("duvida", "ia"),
      linha("a_confirmar", "sinais_ambiguos"),
      linha("email_invalido", "devolucao"),
      linha("email_invalido", "devolucao"),
    ],
    gmail: { envios: 2, destinatarios: 12 },
    ...sobre,
  };
}

const valor = (m: (string | number)[][], rotulo: string, col = 1) => m.find((l) => String(l[0]).startsWith(rotulo))?.[col];

describe("montarAbasPlanilha — resumo", () => {
  it("a produção vem dos envios e das consultas registradas", () => {
    const { resumo } = montarAbasPlanilha(cenario());
    expect(valor(resumo, "E-mails de solicitação enviados")).toBe(2);
    expect(valor(resumo, "Destinatários contatados")).toBe(12);
    expect(valor(resumo, "Média de destinatários por e-mail")).toBe(6);
  });

  it("os desfechos formam uma PARTIÇÃO exata das consultas ligadas (sem as 'sem fornecedor')", () => {
    const { resumo } = montarAbasPlanilha(cenario());
    const partes = ["Orçamento", "Recusa", "Dúvida", "A confirmar", "Sem resposta", "E-mail devolvido"].map(
      (r) => valor(resumo, r) as number,
    );
    expect(partes).toEqual([2, 2, 1, 1, 4, 2]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(12);
  });

  it("os números do dashboard são os de `contarConsultas` (a MESMA função), inclusive a resposta sem fornecedor", () => {
    const e = cenario();
    const esperado = contarConsultas(e.consultas, { inicio: d("2026-01-01"), fim: AGORA });
    const { resumo } = montarAbasPlanilha(e);
    expect(valor(resumo, "Consultas entregues")).toBe(esperado.consultadas);
    expect(valor(resumo, "Orçamentos (inclui")).toBe(esperado.orcamentos);
    expect(valor(resumo, "Recusas (inclui")).toBe(esperado.recusas);
    expect(valor(resumo, "Dúvidas (inclui")).toBe(esperado.duvidas);
    // a recusa sem fornecedor ligado existe SÓ no dashboard: 2 ligadas + 1 sem fornecedor = 3
    expect(valor(resumo, "Recusas (inclui")).toBe(3);
    expect(valor(resumo, "Recusa")).toBe(2);
    expect(valor(resumo, "RETORNO ÚTIL")).toBe(esperado.orcamentos + esperado.recusas + esperado.duvidas);
    expect(valor(resumo, "    respostas já classificadas sem fornecedor", 2)).toBe("0 / 1 / 0");
  });

  it("porcentagem com o arredondamento do dashboard: abaixo de 10% uma casa, senão inteiro", () => {
    const e = cenario();
    const { resumo } = montarAbasPlanilha(e);
    // 6 úteis (2+3+1) em 10 entregues = 60%
    expect(valor(resumo, "RETORNO ÚTIL", 2)).toBe("60%");
    const raro = montarAbasPlanilha(
      cenario({ consultas: [...Array(60).fill(null).map(() => c("sem_resposta", "2026-01-10")), c("recusa", "2026-01-10")] }),
    );
    expect(valor(raro.resumo, "Recusas (inclui", 2)).toBe("1,6%");
  });

  it("lista quem decidiu a classe (só orçamento, recusa e dúvida), do mais frequente ao menos", () => {
    const { resumo } = montarAbasPlanilha(cenario());
    expect(valor(resumo, "IA")).toBe(2);
    expect(valor(resumo, "Decisão do analista")).toBe(1);
    expect(valor(resumo, "Frase de recusa (regra)")).toBe(1);
    // "a confirmar" e devolvido não entram nessa contagem: só 3 rótulos de quem decidiu aparecem
    const i = resumo.findIndex((l) => String(l[0]).startsWith("QUEM DECIDIU"));
    const fim = resumo.findIndex((l, k) => k > i && l.length === 0);
    expect(resumo.slice(i + 1, fim).map((l) => l[0])).toEqual(["IA", "Anexo PDF (regra)", "Decisão do analista", "Frase de recusa (regra)"]);
  });

  it("a célula de conferência da gravação nasce 'gravando', no lugar combinado", () => {
    const { resumo } = montarAbasPlanilha(cenario());
    expect(resumo[CELULA_CONFERENCIA.linha]![0]).toBe("Gravação conferida por releitura");
    expect(resumo[CELULA_CONFERENCIA.linha]![CELULA_CONFERENCIA.coluna]).toBe(GRAVANDO);
  });

  it("a data 'Gerado em' é no fuso de Brasília", () => {
    expect(valor(montarAbasPlanilha(cenario()).resumo, "Gerado em")).toBe("24/11/2026 10:00");
  });
});

describe("montarAbasPlanilha — conferências", () => {
  const nome = (e: EntradaPlanilha, parte: string) => montarAbasPlanilha(e).verificacoes.find((v) => v.nome.includes(parte))!;

  it("cenário íntegro: tudo OK", () => {
    expect(montarAbasPlanilha(cenario()).verificacoes.map((v) => v.ok)).toEqual([true, true, true, true, true]);
  });

  it("consultas faltando em relação ao declarado nos envios: DIVERGE", () => {
    const e = cenario({ envios: [{ dataEnvio: d("2026-01-10"), totalDestinatarios: 7 }, { dataEnvio: d("2026-03-05"), totalDestinatarios: 9 }] });
    expect(nome(e, "declarados nos envios").ok).toBe(false);
  });

  it("linhas da aba de consultas que não batem com o resumo: DIVERGE", () => {
    expect(nome(cenario({ linhas: [linha("orcamento", "ia")] }), "Linhas da aba").ok).toBe(false);
  });

  it("cruzamento com o Gmail: divergência de envios e de destinatários é apontada separadamente", () => {
    expect(nome(cenario({ gmail: { envios: 3, destinatarios: 12 } }), "Lev_Envios").ok).toBe(false);
    expect(nome(cenario({ gmail: { envios: 2, destinatarios: 13 } }), "Lev_Destinatarios").ok).toBe(false);
    expect(nome(cenario({ gmail: { envios: 3, destinatarios: 12 } }), "Lev_Destinatarios").ok).toBe(true);
  });

  it("aba do Gmail ilegível: NÃO CONFERIDO (null), nunca OK nem DIVERGE", () => {
    const e = cenario({ gmail: { envios: null, destinatarios: null } });
    expect(nome(e, "Lev_Envios").ok).toBeNull();
    expect(nome(e, "Lev_Destinatarios").ok).toBeNull();
    const { resumo } = montarAbasPlanilha(e);
    expect(resumo.filter((l) => l.length === 3 && l[1] === "NÃO CONFERIDO")).toHaveLength(2);
  });

  it("o resumo escreve OK / DIVERGE / NÃO CONFERIDO ao lado de cada conferência", () => {
    const { resumo } = montarAbasPlanilha(cenario({ gmail: { envios: 9, destinatarios: null } }));
    const resultados = resumo.filter((l) => l.length === 3 && String(l[0]).includes("Lev_")).map((l) => l[1]);
    expect(resultados).toEqual(["DIVERGE", "NÃO CONFERIDO"]);
  });
});

describe("montarAbasPlanilha — por mês", () => {
  it("uma linha por mês até o mês atual, mais o total", () => {
    const { porMes } = montarAbasPlanilha(cenario());
    expect(porMes[0]![0]).toBe("Mês");
    expect(porMes.slice(1).map((l) => l[0])).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "Total",
    ]);
  });

  it("separa os meses pelo envio, no fuso de Brasília", () => {
    const { porMes } = montarAbasPlanilha(cenario());
    const jan = porMes.find((l) => l[0] === "2026-01")!;
    const mar = porMes.find((l) => l[0] === "2026-03")!;
    expect(jan.slice(1, 9)).toEqual([1, 7, 2, 1, 1, 1, 1, 1]);
    expect(mar.slice(1, 9)).toEqual([1, 5, 0, 1, 0, 0, 3, 1]);
  });

  it("um envio às 23h50 de 31/jan (Brasília) fica em janeiro, não em fevereiro", () => {
    const tarde = new Date("2026-01-31T23:50:00-03:00");
    const e = cenario({
      consultas: [c("orcamento", "2026-01-10", { dataEnvio: tarde })],
      envios: [{ dataEnvio: tarde, totalDestinatarios: 1 }],
    });
    const { porMes } = montarAbasPlanilha(e);
    expect(porMes.find((l) => l[0] === "2026-01")![2]).toBe(1);
    expect(porMes.find((l) => l[0] === "2026-02")![2]).toBe(0);
  });

  it("a linha de total é a soma dos meses", () => {
    const { porMes } = montarAbasPlanilha(cenario());
    const meses = porMes.slice(1, -1);
    const total = porMes[porMes.length - 1]!;
    for (const col of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(total[col]).toBe(meses.reduce((s, l) => s + (l[col] as number), 0));
    }
  });

  it("em ano passado mostra os 12 meses", () => {
    const { porMes } = montarAbasPlanilha(cenario({ ano: 2025, agora: new Date("2026-02-01T12:00:00Z"), consultas: [], envios: [], linhas: [] }));
    expect(porMes).toHaveLength(14); // cabeçalho + 12 meses + total
  });
});

describe("montarAbasPlanilha — consultas respondidas", () => {
  it("só as já respondidas ou devolvidas, com rótulo, quem decidiu e link do Gmail", () => {
    const { consultas } = montarAbasPlanilha(cenario());
    expect(consultas[0]).toEqual(["envioId (Gmail)", "E-mail consultado", "Situação", "Quem decidiu", "Data da resposta", "Link da resposta"]);
    expect(consultas).toHaveLength(9); // cabeçalho + 8 linhas
    const l = consultas[1]!;
    expect(l[0]).toBe("env1");
    expect(["Orçamento", "Recusa", "Dúvida", "A confirmar", "E-mail devolvido"]).toContain(l[2]);
    expect(String(l[5])).toContain("https://mail.google.com/mail/?authuser=compras%40camarasantos.sp.gov.br#all/msg1");
  });

  it("sem id de resposta o link fica vazio (nunca um link quebrado)", () => {
    const { consultas } = montarAbasPlanilha(cenario({ linhas: [linha("recusa", "manual", { respostaGmailId: null, dataResposta: null })] }));
    expect(consultas[1]![5]).toBe("");
    expect(consultas[1]![4]).toBe("");
  });

  it("linha 'sem resposta' que escape do filtro é denunciada pela conferência (não passa em silêncio)", () => {
    const { verificacoes } = montarAbasPlanilha(cenario({ linhas: [...cenario().linhas, linha("sem_resposta", null)] }));
    expect(verificacoes.find((v) => v.nome.includes("Linhas da aba"))!.ok).toBe(false);
  });
});

describe("rotuloDaRegra", () => {
  it("traduz as regras conhecidas e mantém o código das desconhecidas", () => {
    expect(rotuloDaRegra("manual")).toBe("Decisão do analista");
    expect(rotuloDaRegra("ia")).toBe("IA");
    expect(rotuloDaRegra("regra_nova")).toBe("regra_nova");
    expect(rotuloDaRegra(null)).toBe("—");
  });
});

describe("primeiraDiferenca", () => {
  it("matrizes iguais (número × texto, célula vazia no fim): sem diferença", () => {
    expect(primeiraDiferenca([["a", 1, 64.7], ["b", "", ""], []], [["a", "1", "64.7"], ["b"]])).toBeNull();
  });

  it("aponta a linha e a coluna da primeira diferença", () => {
    expect(primeiraDiferenca([["a", 1], ["b", 2]], [["a", "1"], ["b", "3"]])).toBe("linha 2, coluna 2");
  });

  it("detecta linha a mais ou a menos", () => {
    expect(primeiraDiferenca([["a"], ["b"]], [["a"]])).toBe("2 linhas esperadas × 1 lidas");
    expect(primeiraDiferenca([["a"]], [["a"], ["lixo"]])).toBe("1 linhas esperadas × 2 lidas");
  });

  it("sobra de conteúdo antigo abaixo da matriz é diferença", () => {
    expect(primeiraDiferenca([["a"]], [["a"], ["", "resto antigo"]])).toBe("1 linhas esperadas × 2 lidas");
  });

  it("coluna a mais na leitura é diferença", () => {
    expect(primeiraDiferenca([["a", 1]], [["a", "1", "x"]])).toBe("linha 1: 2 colunas esperadas × 3 lidas");
  });
});

describe("nomes das abas", () => {
  it("são os combinados com o usuário", () => {
    expect([ABA_RESUMO, ABA_POR_MES, ABA_CONSULTAS]).toEqual(["Plataforma_Resumo", "Plataforma_Por_mes", "Plataforma_Consultas"]);
  });
});
