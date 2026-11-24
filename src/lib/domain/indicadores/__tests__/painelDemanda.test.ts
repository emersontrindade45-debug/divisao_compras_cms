import { describe, expect, it } from "vitest";
import type { Remessa } from "../demanda";
import {
  categoriaDoRotulo,
  dataMaisRecente,
  detalharProcessos,
  diasEntre,
  filtrarRemessas,
  frasesMudou,
  lerFiltrosDoPainel,
  montarPainelDemanda,
  nivelDoProcesso,
  resumirPeriodo,
  serieMensal,
  somarDias,
} from "../painelDemanda";

let seq = 0;
/** Remessa de teste: o tipo do processo vem do rótulo; `n` é o número/ano do processo. */
function rem(data: string, n: string, tipo = "Geral", email?: string): Remessa {
  const rotulo = `${tipo} Nº ${n} - volume 1`;
  return {
    data,
    ano: Number(data.slice(0, 4)),
    mes: Number(data.slice(5, 7)),
    chave: n,
    rotulo,
    idEmail: email ?? `e${++seq}`,
  };
}
/** `k` passagens de um processo, uma por dia a partir de `inicio`. */
function passagens(n: string, k: number, inicio: string, passo = 1, tipo = "Geral"): Remessa[] {
  return Array.from({ length: k }, (_, i) => rem(somarDias(inicio, i * passo), n, tipo));
}

describe("datas em texto", () => {
  it("diasEntre e somarDias atravessam mês, ano e ano bissexto", () => {
    expect(diasEntre("2026-01-31", "2026-02-01")).toBe(1);
    expect(diasEntre("2025-12-31", "2026-01-01")).toBe(1);
    expect(diasEntre("2024-02-28", "2024-03-01")).toBe(2);
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("mesmo dia vale zero", () => {
    expect(diasEntre("2026-05-05", "2026-05-05")).toBe(0);
  });
});

describe("categoriaDoRotulo", () => {
  it.each([
    ["Aquisição de Bens Nº 1/2026 - volume 1", "bens"],
    ["Aquisição de Serviços Nº 2/2026 - volume 1", "servicos"],
    ["Geral Nº 110/2026 - volume 1", "geral"],
    ["Manutenção e conservação do edifício Nº 3/2026 - volume 1", "outros"],
    ["Reserva de recurso, empenho e liquidação da despesa Nº 4/2026 - volume 1", "outros"],
  ])("%s → %s", (rotulo, categoria) => {
    expect(categoriaDoRotulo(rotulo)).toBe(categoria);
  });
});

describe("nivelDoProcesso", () => {
  it.each([
    [1, "normal"],
    [3, "normal"],
    [4, "atencao"],
    [6, "atencao"],
    [7, "critico"],
    [23, "critico"],
  ] as const)("%i passagens → %s", (n, nivel) => {
    expect(nivelDoProcesso(n)).toBe(nivel);
  });
});

describe("resumirPeriodo", () => {
  it("conta devoluções só além da 3ª passagem, por processo", () => {
    // A: 5 passagens (2 devoluções); B: 2 (nenhuma); C: 4 (1 devolução)
    const r = resumirPeriodo([
      ...passagens("1/2026", 5, "2026-01-05"),
      ...passagens("2/2026", 2, "2026-01-05"),
      ...passagens("3/2026", 4, "2026-02-01"),
    ]);
    expect(r.remessas).toBe(11);
    expect(r.processos).toBe(3);
    expect(r.devolucoes).toBe(3);
    expect(r.processosDevolvidos).toBe(2);
    expect(r.taxaDevolucao).toBeCloseTo(3 / 11);
    expect(r.pctProcessosDevolvidos).toBeCloseTo(2 / 3);
    expect(r.mediaPassagens).toBeCloseTo(11 / 3);
    expect(r.maxPassagens).toBe(5);
  });

  it("intervalo mediano: dias corridos entre passagens do MESMO processo, mesmo dia = 0, mediana e não média", () => {
    // A: 05/01, 05/01 (0), 15/01 (10), 04/02 (20) → intervalos 0, 10, 20 ; B: 01/03, 02/03 → 1
    const r = resumirPeriodo([
      rem("2026-01-05", "1/2026"),
      rem("2026-01-05", "1/2026"),
      rem("2026-01-15", "1/2026"),
      rem("2026-02-04", "1/2026"),
      rem("2026-03-01", "2/2026"),
      rem("2026-03-02", "2/2026"),
    ]);
    // intervalos [0, 10, 20, 1] → ordenados [0, 1, 10, 20] → mediana (1+10)/2 = 5,5 (a média seria 7,75)
    expect(r.intervaloMedianoDias).toBe(5.5);
  });

  it("a ordem de entrada não muda o resultado (passagens ordenadas por data)", () => {
    const a = [...passagens("1/2026", 5, "2026-01-05", 3)];
    const emOrdem = resumirPeriodo(a);
    const invertida = resumirPeriodo([...a].reverse());
    expect(invertida).toEqual(emOrdem);
  });

  it("sem remessas: zeros e intervalo nulo, sem dividir por zero", () => {
    expect(resumirPeriodo([])).toEqual({
      remessas: 0,
      processos: 0,
      devolucoes: 0,
      processosDevolvidos: 0,
      taxaDevolucao: 0,
      pctProcessosDevolvidos: 0,
      mediaPassagens: 0,
      maxPassagens: 0,
      intervaloMedianoDias: null,
    });
  });

  it("processo com uma só passagem não gera intervalo", () => {
    expect(resumirPeriodo([rem("2026-01-05", "1/2026")]).intervaloMedianoDias).toBeNull();
  });
});

describe("filtrarRemessas", () => {
  const todas = [
    rem("2025-03-10", "1/2025"),
    rem("2026-03-10", "2/2026"),
    rem("2026-03-11", "3/2026", "Aquisição de Bens"),
    rem("2026-04-01", "4/2026"),
  ];
  it("filtra por ano e por categoria", () => {
    expect(filtrarRemessas(todas, { ano: 2026 })).toHaveLength(3);
    expect(filtrarRemessas(todas, { ano: 2026, categoria: "bens" }).map((r) => r.chave)).toEqual([
      "3/2026",
    ]);
  });
  it("corte 'até o mesmo dia' é inclusivo e respeita o mês", () => {
    expect(
      filtrarRemessas(todas, { ano: 2026, ate: { mes: 3, dia: 10 } }).map((r) => r.chave),
    ).toEqual(["2/2026"]);
    expect(filtrarRemessas(todas, { ano: 2026, ate: { mes: 3, dia: 31 } })).toHaveLength(2);
    // 1º de abril fica de fora de "até 31/03" mesmo com dia menor
    expect(
      filtrarRemessas(todas, { ano: 2026, ate: { mes: 3, dia: 31 } }).some(
        (r) => r.chave === "4/2026",
      ),
    ).toBe(false);
  });
});

describe("serieMensal", () => {
  it("atribui a devolução ao mês em que a passagem além da 3ª aconteceu", () => {
    const s = serieMensal([
      rem("2026-01-05", "1/2026"),
      rem("2026-01-20", "1/2026"),
      rem("2026-02-10", "1/2026"),
      rem("2026-03-15", "1/2026"), // 4ª passagem: devolução em março
      rem("2026-03-20", "1/2026"), // 5ª: devolução em março
    ]);
    expect(s).toHaveLength(12);
    expect(s.map((m) => m.remessas).slice(0, 4)).toEqual([2, 1, 2, 0]);
    expect(s.map((m) => m.devolucoes).slice(0, 4)).toEqual([0, 0, 2, 0]);
  });
  it("a soma das devoluções do ano é a soma das devoluções por processo", () => {
    const rs = [
      ...passagens("1/2026", 6, "2026-01-05", 20),
      ...passagens("2/2026", 4, "2026-02-01", 5),
    ];
    const s = serieMensal(rs);
    expect(s.reduce((x, m) => x + m.devolucoes, 0)).toBe(resumirPeriodo(rs).devolucoes);
    expect(s.reduce((x, m) => x + m.remessas, 0)).toBe(rs.length);
  });
});

describe("detalharProcessos", () => {
  it("traz nível, histórico com intervalos e marca devolução a partir da 4ª", () => {
    const [p] = detalharProcessos(passagens("9/2026", 5, "2026-01-10", 2), "2026-02-01");
    expect(p).toMatchObject({
      chave: "9/2026",
      passagens: 5,
      devolucoes: 2,
      nivel: "atencao",
      primeira: "2026-01-10",
      ultima: "2026-01-18",
    });
    expect(p!.historico.map((h) => h.devolucao)).toEqual([false, false, false, true, true]);
    expect(p!.historico.map((h) => h.intervaloDias)).toEqual([null, 2, 2, 2, 2]);
    expect(p!.intervaloMedianoDias).toBe(2);
    expect(p!.maiorIntervaloDias).toBe(2);
    expect(p!.diasSemNovaPassagem).toBe(14);
  });
  it("sem 'hoje' não calcula dias sem nova passagem (ano fechado)", () => {
    expect(
      detalharProcessos(passagens("9/2026", 2, "2026-01-10"))[0]!.diasSemNovaPassagem,
    ).toBeNull();
  });
  it("ordena por passagens e desempata pela chave", () => {
    const lista = detalharProcessos([
      ...passagens("2/2026", 2, "2026-01-01"),
      ...passagens("1/2026", 2, "2026-01-01"),
      ...passagens("3/2026", 5, "2026-01-01"),
    ]);
    expect(lista.map((p) => p.chave)).toEqual(["3/2026", "1/2026", "2/2026"]);
  });
  it("o rótulo e a categoria são os da passagem mais recente", () => {
    const [p] = detalharProcessos([
      rem("2026-01-01", "5/2026", "Geral"),
      rem("2026-02-01", "5/2026", "Aquisição de Bens"),
    ]);
    expect(p!.categoria).toBe("bens");
    expect(p!.rotulo).toContain("Aquisição de Bens");
  });
});

describe("montarPainelDemanda", () => {
  const hoje = "2026-11-24";
  const base = [
    // 2025: um processo com 5 passagens até 20/11/2025 (3 devoluções... 2) e uma passagem em 15/12/2025 (fora do mesmo trecho)
    ...passagens("10/2025", 5, "2025-03-01", 10),
    rem("2025-12-15", "11/2025"),
    // 2026
    ...passagens("20/2026", 4, "2026-02-01", 7),
    rem("2026-11-24", "21/2026", "Aquisição de Bens"),
  ];

  it("no ano corrente compara o MESMO trecho do ano anterior (a passagem de dezembro/2025 não entra)", () => {
    const p = montarPainelDemanda(base, { ano: 2026, hoje });
    expect(p.parcial).toBe(true);
    expect(p.corte).toEqual({ mes: 11, dia: 24 });
    expect(p.atual.remessas).toBe(5);
    expect(p.anterior!.remessas).toBe(5); // só as 5 do processo 10/2025
  });

  it("o gráfico usa o ano anterior INTEIRO", () => {
    const p = montarPainelDemanda(base, { ano: 2026, hoje });
    expect(p.serie.anterior!.reduce((x, m) => x + m.remessas, 0)).toBe(6);
  });

  it("ano fechado compara com o ano anterior inteiro e não gera frases", () => {
    const rs = [...base, ...passagens("5/2024", 2, "2024-06-01")];
    const p = montarPainelDemanda(rs, { ano: 2025, hoje });
    expect(p.parcial).toBe(false);
    expect(p.corte).toBeNull();
    expect(p.atual.remessas).toBe(6);
    expect(p.anterior!.remessas).toBe(2);
    expect(p.frases).toEqual([]);
    expect(p.processos[0]!.diasSemNovaPassagem).toBeNull();
  });

  it("primeiro ano de dados: sem anterior (null), não zeros", () => {
    const p = montarPainelDemanda(passagens("1/2024", 4, "2024-01-01"), {
      ano: 2024,
      hoje: "2024-12-31",
    });
    expect(p.anterior).toBeNull();
    expect(p.serie.anterior).toBeNull();
  });

  it("o filtro de categoria vale para tudo: resumo, série, processos", () => {
    const p = montarPainelDemanda(base, { ano: 2026, hoje, categoria: "bens" });
    expect(p.atual.remessas).toBe(1);
    expect(p.processos.map((x) => x.chave)).toEqual(["21/2026"]);
    expect(p.anterior).toBeNull();
  });

  it("devolve as quatro categorias com resumo atual e anterior", () => {
    const p = montarPainelDemanda(base, { ano: 2026, hoje });
    expect(p.porCategoria.map((c) => c.categoria)).toEqual(["bens", "servicos", "geral", "outros"]);
    expect(p.porCategoria.find((c) => c.categoria === "geral")!.atual.remessas).toBe(4);
    expect(p.porCategoria.find((c) => c.categoria === "bens")!.atual.remessas).toBe(1);
  });
});

describe("frasesMudou", () => {
  const hoje = "2026-11-24";
  it("remessas dos últimos 7 dias contra os 7 anteriores, com variação", () => {
    const rs = [
      ...Array.from({ length: 6 }, () => rem("2026-11-20", "1/2026")),
      ...Array.from({ length: 3 }, () => rem("2026-11-14", "2/2026")),
    ];
    const f = frasesMudou(rs, hoje).find((x) => x.codigo === "remessas_7d");
    expect(f).toMatchObject({ atual: 6, anterior: 3, variacaoPct: 1, tendencia: "neutra" });
  });

  it("a janela de 7 dias inclui hoje e exclui o oitavo dia", () => {
    const rs = [
      rem("2026-11-24", "1/2026"),
      rem("2026-11-18", "1/2026"),
      rem("2026-11-17", "1/2026"),
    ];
    const f = frasesMudou(rs, hoje).find((x) => x.codigo === "remessas_7d");
    expect(f).toMatchObject({ atual: 2, anterior: 1 });
  });

  it("sem remessas nos 7 dias anteriores a variação é nula, não infinita", () => {
    const f = frasesMudou([rem("2026-11-24", "1/2026")], hoje).find(
      (x) => x.codigo === "remessas_7d",
    );
    expect(f).toMatchObject({ atual: 1, anterior: 0, variacaoPct: null });
  });

  it("devolução dos últimos 30 dias contra os 30 anteriores, em pontos percentuais, e piora quando sobe", () => {
    // processo com 8 passagens: as 4ª a 8ª são devolução. Datas de 10/10 a 24/11 espaçadas.
    const rs = [
      rem("2026-09-10", "1/2026"),
      rem("2026-09-20", "1/2026"),
      rem("2026-09-30", "1/2026"), // 30–59 dias atrás
      rem("2026-10-28", "1/2026"),
      rem("2026-11-05", "1/2026"),
      rem("2026-11-12", "1/2026"),
      rem("2026-11-20", "1/2026"),
      rem("2026-11-24", "1/2026"),
    ];
    const f = frasesMudou(rs, hoje).find((x) => x.codigo === "devolucao_30d");
    expect(f).toMatchObject({ atual: 1, anterior: 0, tendencia: "piora" });
    expect((f as { deltaPp: number }).deltaPp).toBeCloseTo(100);
  });

  it("sem dados em uma das janelas de 30 dias não inventa frase de devolução", () => {
    expect(
      frasesMudou([rem("2026-11-24", "1/2026")], hoje).some((x) => x.codigo === "devolucao_30d"),
    ).toBe(false);
  });

  it("lista os processos que chegaram à 7ª passagem nos últimos 30 dias (no máximo 3 na frase, com o total)", () => {
    const criticos = ["1", "2", "3", "4"].flatMap((n) => [
      ...passagens(`${n}/2026`, 6, "2026-09-01", 5),
      rem("2026-11-10", `${n}/2026`),
    ]);
    const antigo = passagens("9/2026", 7, "2026-01-01", 5); // 7ª passagem em janeiro: não é novo
    const f = frasesMudou([...criticos, ...antigo], hoje).find(
      (x) => x.codigo === "criticos_novos",
    );
    expect(f).toMatchObject({ total: 4, tendencia: "piora" });
    expect((f as { processos: unknown[] }).processos).toHaveLength(3);
  });

  it("a 7ª passagem de 30 dias atrás ainda conta; a de 31 dias atrás não", () => {
    const quase = [...passagens("1/2026", 6, "2026-08-01", 5), rem(somarDias(hoje, -29), "1/2026")];
    const longe = [...passagens("2/2026", 6, "2026-08-01", 5), rem(somarDias(hoje, -30), "2/2026")];
    expect(frasesMudou(quase, hoje).some((x) => x.codigo === "criticos_novos")).toBe(true);
    expect(frasesMudou(longe, hoje).some((x) => x.codigo === "criticos_novos")).toBe(false);
  });

  it("a categoria com maior taxa ignora categoria de amostra pequena", () => {
    // "outros": 12 remessas, 9 devoluções (75%) — taxa MAIOR que a de Serviços, mas amostra pequena (< 20)
    const outros = passagens("7/2026", 12, "2026-03-01", 2, "Manutenção");
    // Serviços: 30 remessas em 3 processos de 10 passagens, 21 devoluções (70%)
    const servicos = ["8", "9", "10"].flatMap((n) =>
      passagens(`${n}/2026`, 10, "2026-03-01", 2, "Aquisição de Serviços"),
    );
    const f = frasesMudou([...outros, ...servicos], hoje).find(
      (x) => x.codigo === "categoria_maior_devolucao",
    );
    expect(f).toMatchObject({ categoria: "servicos", deltaPpAnoAnterior: null });
    expect((f as { taxa: number }).taxa).toBeCloseTo(0.7);
  });

  it("a categoria líder traz a diferença em p.p. contra o MESMO período do ano anterior", () => {
    const atual = passagens("8/2026", 30, "2026-02-01", 1, "Aquisição de Serviços"); // 27 devoluções / 30
    const anterior = [...passagens("8/2025", 25, "2025-02-01", 1, "Aquisição de Serviços")]; // 22/25
    const f = frasesMudou([...atual, ...anterior], hoje).find(
      (x) => x.codigo === "categoria_maior_devolucao",
    );
    expect((f as { taxa: number }).taxa).toBeCloseTo(27 / 30);
    expect((f as { deltaPpAnoAnterior: number }).deltaPpAnoAnterior).toBeCloseTo(
      (27 / 30 - 22 / 25) * 100,
    );
  });

  it("o processo com mais passagens do ano, com a data da última", () => {
    const rs = [
      ...passagens("1/2026", 3, "2026-01-01"),
      ...passagens("2/2026", 9, "2026-02-01", 3),
    ];
    const f = frasesMudou(rs, hoje).find((x) => x.codigo === "processo_mais_passagens");
    expect(f).toMatchObject({ chave: "2/2026", passagens: 9, ultima: "2026-02-25" });
  });

  it("o filtro de categoria restringe todas as frases", () => {
    const rs = [
      ...passagens("1/2026", 5, "2026-11-20", 1, "Aquisição de Bens"),
      ...passagens("2/2026", 9, "2026-11-10", 1, "Geral"),
    ];
    const f = frasesMudou(rs, hoje, "bens").find((x) => x.codigo === "processo_mais_passagens");
    expect(f).toMatchObject({ chave: "1/2026" });
    expect(frasesMudou(rs, hoje, "bens").find((x) => x.codigo === "remessas_7d")).toMatchObject({
      atual: 5,
    });
  });
});

describe("dataMaisRecente", () => {
  it("devolve a maior data ou null", () => {
    expect(
      dataMaisRecente([
        rem("2026-01-02", "1/2026"),
        rem("2026-11-24", "1/2026"),
        rem("2025-12-31", "1/2025"),
      ]),
    ).toBe("2026-11-24");
    expect(dataMaisRecente([])).toBeNull();
  });
});

describe("lerFiltrosDoPainel", () => {
  it("aceita ano de 4 dígitos e categoria conhecida", () => {
    expect(lerFiltrosDoPainel({ ano: "2025", categoria: "bens" })).toEqual({
      ano: 2025,
      categoria: "bens",
    });
  });
  it("sem parâmetros: painel padrão", () => {
    expect(lerFiltrosDoPainel({})).toEqual({ ano: undefined, categoria: null });
  });
  it.each(["20x6", "202", "20266", "2026; drop", "-2026", " 2026", ""])(
    "ano inválido %j é ignorado",
    (ano) => {
      expect(lerFiltrosDoPainel({ ano }).ano).toBeUndefined();
    },
  );
  it.each(["todas", "BENS", "bens,servicos", "constructor", "__proto__", ""])(
    "categoria inválida %j é ignorada",
    (categoria) => {
      expect(lerFiltrosDoPainel({ categoria }).categoria).toBeNull();
    },
  );
});
