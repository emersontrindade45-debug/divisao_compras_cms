import { describe, it, expect } from "vitest";
import { parseCsv } from "../csv";
import {
  parseNumberBR,
  parsePlanilha,
  estatisticaDoItem,
  isDataSheet,
  explicarAusenciaDeItens,
} from "../parsePlanilha";
import {
  extrairSpreadsheetId,
  extrairNumeroProcesso,
  extrairObjetoDoTitulo,
} from "../googleSheets";

// CSV real exportado da planilha do processo (aba "Modelo"), com cabeçalho
// multilinha ("QTDE.\nMÍN") e colunas deslocadas por células mescladas.
const csvTelefonia = [
  '"LIMITE INFERIOR","","","","","QTDE.\nMÍN","","MATERIAL"," DOMÍNIO AMPLO I "," DOMÍNIO AMPLO II ","DOMÍNIO AMPLO III","DOMÍNIO AMPLO IV","","","","","PREÇO PÚBLICO V"',
  '"2.327,18","3.324,54","4.321,90","997,36","1","1","1","Contratação de empresa para fornecimento de Serviço de Telefonia Fixa Comutada - STFC","","","","","R$ 4.037,07","R$ 2.500,00","4606,15","2612,01"',
  '"Em conformidade com o inciso III do Art. 57 do ato 17/2023 da Câmara Municipal de Santos","","","","","","","","","","","","","","","",""',
  '"","","","","","Preços Válidos","","","","","","","","","","",""',
].join("\n");

const csvComGrupo = [
  '"LIMITE INFERIOR","MEDIANA","LIMITE SUPERIOR","","ITEM","QTDE MÍN","QTDE MÁX","MATERIAL","PREÇO PÚBLICO I","PREÇO PÚBLICO II","PREÇO PÚBLICO III"',
  '"LOTE 01","","","","","","","","","",""',
  '"700,00","1.000,00","1.300,00","","1","1","2","Bomba vácuo 2 a 5 litros","998,81","1.267,24","1.290,00"',
  '"447,99","639,98","831,97","","2","1","8","Caixa de filtragem FILBOX","453,83","639,98","765,96"',
].join("\n");

// Planilha no estado inicial: itens cadastrados, pesquisa ainda não realizada
// (mediana e limites zerados — §9.10: deve importar mesmo assim)
const csvMedianaZero = [
  '"LIMITE INFERIOR","MEDIANA","LIMITE SUPERIOR","","ITEM","QTDE.","MATERIAL","ORÇAMENTO"',
  '"0,00","0,00","0,00","","1","15","e-CPF Tipo A3 c/ Token – Validade Mínima de 36 meses",""',
  '"0,00","0,00","0,00","","2","6","e-CNPJ Tipo A3 c/ Token – Validade Mínima de 36 meses",""',
  '"Em conformidade com o inciso III do Art. 57 do ato 17/2023","","","","","","",""',
].join("\n");

describe("parseNumberBR", () => {
  it("converte formatos pt-BR", () => {
    expect(parseNumberBR("2.327,18")).toBeCloseTo(2327.18, 2);
    expect(parseNumberBR("R$ 4.037,07")).toBeCloseTo(4037.07, 2);
    expect(parseNumberBR("4606,15")).toBeCloseTo(4606.15, 2);
    expect(parseNumberBR("997.36")).toBeCloseTo(997.36, 2);
    expect(parseNumberBR("1")).toBe(1);
  });
  // Regressão CLAUDE.md §9.70: "1.000" (ponto sem vírgula) é milhar em pt-BR, não decimal.
  // Number("1.000") ingenuamente devolveria 1 — R$ 15.000 entrando como R$ 15 na série de preços.
  it("trata ponto sem vírgula como separador de milhar (grupos de 3 dígitos)", () => {
    expect(parseNumberBR("1.000")).toBe(1000);
    expect(parseNumberBR("15.000")).toBe(15000);
    expect(parseNumberBR("1.200.000")).toBe(1200000);
    // Mas "997.36" continua decimal — só 2 dígitos depois do ponto, não é grupo de milhar.
    expect(parseNumberBR("997.36")).toBeCloseTo(997.36, 2);
    expect(parseNumberBR("1.5")).toBeCloseTo(1.5, 2);
  });
  it("retorna NaN para vazio/texto", () => {
    expect(Number.isNaN(parseNumberBR(""))).toBe(true);
    expect(Number.isNaN(parseNumberBR("LOTE 01"))).toBe(true);
    expect(Number.isNaN(parseNumberBR(undefined))).toBe(true);
  });
});

describe("parseCsv", () => {
  it("mantém campos multilinha entre aspas", () => {
    const rows = parseCsv(csvTelefonia);
    expect(rows[0]![5]).toBe("QTDE.\nMÍN");
    expect(rows[0]![7]).toBe("MATERIAL");
  });
});

describe("isDataSheet", () => {
  it("detecta aba com cabeçalho MATERIAL", () => {
    expect(isDataSheet(parseCsv(csvTelefonia))).toBe(true);
    expect(isDataSheet(parseCsv('"LEGENDA","x"\n"a","b"'))).toBe(false);
  });
});

describe("parsePlanilha — exemplo telefonia (1 item)", () => {
  const { itens } = parsePlanilha(parseCsv(csvTelefonia));

  it("extrai um item com material, quantidade e mediana", () => {
    expect(itens).toHaveLength(1);
    const it = itens[0]!;
    expect(it.material).toContain("Telefonia");
    expect(it.item).toBe(1);
    expect(it.quantidade).toBe(1);
    expect(it.mediana).toBeCloseTo(3324.54, 2);
    expect(it.limiteInferior).toBeCloseTo(2327.18, 2);
    expect(it.limiteSuperior).toBeCloseTo(4321.9, 2);
  });

  it("classifica preços conforme a regra dos 30%", () => {
    const precos = itens[0]!.precos;
    expect(precos).toHaveLength(4);
    const incluidos = precos.filter((p) => p.incluido);
    const excluidos = precos.filter((p) => !p.incluido);
    expect(incluidos).toHaveLength(3);
    expect(excluidos).toHaveLength(1);
    expect(excluidos[0]!.valor).toBeCloseTo(4606.15, 2);
    expect(excluidos[0]!.motivoExclusao).toMatch(/exorbitante/i);
  });

  it("calcula a estatística do item", () => {
    const estat = estatisticaDoItem(itens[0]!)!;
    expect(estat.totalPrecos).toBe(4);
    expect(estat.precosIncluidos).toBe(3);
    // valorEstimado usa a média aritmética dos preços incluídos, não a mediana
    // pré-calculada na planilha — a mediana não tem funcionalidade para o usuário.
    expect(estat.valorEstimado).toBeCloseTo(3049.69, 2);
    expect(estat.valorEstimado).toBeCloseTo(estat.media, 2);
    expect(estat.mediana).toBeCloseTo(3324.54, 2);
    expect(estat.menorValor).toBeCloseTo(2500, 2);
  });
});

describe("parsePlanilha — com grupo/lote", () => {
  const { itens } = parsePlanilha(parseCsv(csvComGrupo));

  it("associa o grupo (LOTE) aos itens seguintes", () => {
    expect(itens).toHaveLength(2);
    expect(itens[0]!.grupo).toBe("LOTE 01");
    expect(itens[1]!.grupo).toBe("LOTE 01");
  });

  it("usa QTDE MÁX como quantidade e lê os preços", () => {
    expect(itens[0]!.quantidade).toBe(2);
    expect(itens[0]!.material).toContain("Bomba vácuo");
    expect(itens[0]!.precos).toHaveLength(3);
    expect(itens[0]!.precos.every((p) => p.incluido)).toBe(true);
    expect(itens[0]!.precos[0]!.label).toBe("PREÇO PÚBLICO I");
  });
});

describe("parsePlanilha — estatística zerada (§9.10)", () => {
  const { itens } = parsePlanilha(parseCsv(csvMedianaZero));

  it("importa itens mesmo com mediana = 0 (pesquisa ainda não feita)", () => {
    expect(itens).toHaveLength(2);
  });

  it("preserva material e quantidade corretos", () => {
    expect(itens[0]!.material).toContain("e-CPF");
    expect(itens[0]!.quantidade).toBe(15);
    expect(itens[1]!.material).toContain("e-CNPJ");
    expect(itens[1]!.quantidade).toBe(6);
  });

  it("importa com mediana e limites zerados, sem preços", () => {
    expect(itens[0]!.mediana).toBe(0);
    expect(itens[0]!.limiteInferior).toBe(0);
    expect(itens[0]!.precos).toHaveLength(0);
  });

  it("ignora o rodapé quando MATERIAL está vazio", () => {
    // rodapé de conformidade não vira item porque a coluna MATERIAL está vazia,
    // não por filtro de legenda
    expect(itens).toHaveLength(2);
  });
});

// Planilha-modelo da Câmara no estado inicial REAL: cabeçalho mesclado
// (LIMITE/MEDIANA sem texto na linha do MATERIAL) e células de estatística
// VAZIAS — não "0,00". O teste §9.10 acima usava "0,00" e por isso não
// pegava o bug: parseNumberBR("") é NaN, e exigir mediana finita descartava
// todas as linhas → "Nenhum item encontrado na planilha."
const csvMedianaVaziaCabecalhoMesclado = [
  '"","","","","","QTDE.\nMÍN","","MATERIAL","PREÇO PÚBLICO I","PREÇO PÚBLICO II","PREÇO PÚBLICO III","PREÇO PÚBLICO IV","PREÇO PÚBLICO V"',
  '"","","","","1","","1","Tronco IP SIP","","","","",""',
  '"","","","","2","","75","Ramais DDR","","","","",""',
  '"","","","","3","","227","Ramais sem DDR","","","","",""',
  '"Em conformidade com o inciso III do Art. 57 do ato 17/2023 da Câmara Municipal de Santos","","","","","","","","","","","",""',
].join("\n");

const csvErroFormulaMediana = [
  '"LIMITE INFERIOR","MEDIANA","LIMITE SUPERIOR","","ITEM","QTDE.","MATERIAL"',
  '"#DIV/0!","#N/A","#NUM!","","1","15","e-CPF Tipo A3 c/ Token – Validade Mínima de 36 meses"',
  '"#VALUE!","","#REF!","","2","6","e-CNPJ Tipo A3 c/ Token – Validade Mínima de 36 meses"',
].join("\n");

describe("parsePlanilha — mediana vazia / erro de fórmula (planilha nova)", () => {
  it("importa itens com MATERIAL preenchido mesmo com mediana em branco e cabeçalho mesclado", () => {
    const { itens } = parsePlanilha(parseCsv(csvMedianaVaziaCabecalhoMesclado));
    expect(itens).toHaveLength(3);
    expect(itens.map((it) => it.material)).toEqual([
      "Tronco IP SIP",
      "Ramais DDR",
      "Ramais sem DDR",
    ]);
    expect(itens[0]!.quantidade).toBe(1);
    expect(itens[1]!.quantidade).toBe(75);
    expect(itens[2]!.quantidade).toBe(227);
    expect(itens.every((it) => it.mediana === 0 && it.limiteInferior === 0)).toBe(true);
  });

  it("importa itens quando a mediana é erro de fórmula (#N/A, #DIV/0!, #NUM!)", () => {
    const { itens } = parsePlanilha(parseCsv(csvErroFormulaMediana));
    expect(itens).toHaveLength(2);
    expect(itens[0]!.material).toContain("e-CPF");
    expect(itens[1]!.material).toContain("e-CNPJ");
    expect(itens[0]!.mediana).toBe(0);
    expect(itens[0]!.limiteInferior).toBe(0);
  });

  it("a mutação inversa: exigir mediana finita voltaria a devolver 0 itens", () => {
    // Garante que este teste cai se alguém reintroduzir
    // `material.length > 0 && Number.isFinite(mediana)` como pré-condição.
    const rows = parseCsv(csvMedianaVaziaCabecalhoMesclado);
    const { itens } = parsePlanilha(rows);
    expect(itens.length).toBeGreaterThan(0);
    const medianaDaPrimeira = rows[1]![1];
    expect(medianaDaPrimeira).toBe("");
    expect(Number.isNaN(parseNumberBR(medianaDaPrimeira))).toBe(true);
  });

  it("lê MEDIANA/LIMITES pelo nome do cabeçalho quando a coluna não está em A/B/C", () => {
    // Fallback posicional seria A=ITEM (1) e B=LIMITE INFERIOR (700) como
    // "mediana" — o nome no cabeçalho é o que acerta os três campos.
    const csv = [
      '"ITEM","LIMITE INFERIOR","LIMITE SUPERIOR","MEDIANA","","QTDE","MATERIAL","PREÇO PÚBLICO I"',
      '"1","700,00","1.300,00","1.000,00","","10","Caneta esferográfica","998,00"',
    ].join("\n");
    const { itens } = parsePlanilha(parseCsv(csv));
    expect(itens).toHaveLength(1);
    expect(itens[0]!.material).toBe("Caneta esferográfica");
    expect(itens[0]!.mediana).toBe(1000);
    expect(itens[0]!.limiteInferior).toBe(700);
    expect(itens[0]!.limiteSuperior).toBe(1300);
    expect(itens[0]!.precos).toHaveLength(1);
    expect(itens[0]!.precos[0]!.valor).toBe(998);
  });

  it("importa a linha se MATERIAL tem texto, mesmo parecendo legenda", () => {
    const csv = [
      '"LIMITE INFERIOR","MEDIANA","MATERIAL"',
      '"","","Em conformidade com o Art. 57 — descrição do item"',
    ].join("\n");
    const { itens } = parsePlanilha(parseCsv(csv));
    expect(itens).toHaveLength(1);
    expect(itens[0]!.material).toMatch(/Em conformidade/);
  });
});

describe("explicarAusenciaDeItens", () => {
  it("explica quando o cabeçalho MATERIAL existe mas nenhuma linha tem texto nessa coluna", () => {
    const rows = parseCsv('"LIMITE INFERIOR","MEDIANA","MATERIAL"\n"LOTE 01","",""');
    const msg = explicarAusenciaDeItens(rows);
    expect(msg).toMatch(/nenhuma linha com texto nessa coluna/i);
  });

  it("distingue ausência de cabeçalho", () => {
    expect(explicarAusenciaDeItens(parseCsv('"LEGENDA","x"\n"a","b"'))).toMatch(
      /não foi encontrado o cabeçalho MATERIAL/i,
    );
  });
});

describe("googleSheets — helpers puros", () => {
  it("extrai o ID da planilha da URL", () => {
    expect(
      extrairSpreadsheetId(
        "https://docs.google.com/spreadsheets/d/1nYkuD3CaBUbatXPdirv8X53LAciV0xvkeIjXNl3i2WI/edit?usp=sharing",
      ),
    ).toBe("1nYkuD3CaBUbatXPdirv8X53LAciV0xvkeIjXNl3i2WI");
  });
  it("extrai o número do processo do título", () => {
    expect(extrairNumeroProcesso("Planilha_Mediana Proc_2433/2025")).toBe("2433/2025");
    expect(extrairNumeroProcesso("Sem número")).toBeNull();
  });
});

describe("extrairObjetoDoTitulo", () => {
  it("retorna a parte descritiva removendo o número do processo", () => {
    expect(extrairObjetoDoTitulo("e-CPF e e-CNPJ - Proc_2433/2025")).toBe("e-CPF e e-CNPJ");
    expect(extrairObjetoDoTitulo("Pesquisa de Preços - e-CPF - Proc_2433/2025")).toBe(
      "Pesquisa de Preços - e-CPF",
    );
  });

  it("suporta variações de separador e formato do número", () => {
    expect(extrairObjetoDoTitulo("Aquisição de Selos – Proc. 12/2026")).toBe("Aquisição de Selos");
    expect(extrairObjetoDoTitulo("Uniformes Proc 55/2025")).toBe("Uniformes");
    expect(extrairObjetoDoTitulo("Material de Escritório_Proc_100/2024")).toBe(
      "Material de Escritório",
    );
  });

  it("retorna null quando não há conteúdo descritivo além do número", () => {
    expect(extrairObjetoDoTitulo("Proc_2433/2025")).toBeNull();
    expect(extrairObjetoDoTitulo(null)).toBeNull();
    expect(extrairObjetoDoTitulo("")).toBeNull();
  });

  it('retorna null para título genérico "Pesquisa de Preços"', () => {
    expect(extrairObjetoDoTitulo("Pesquisa de Preços - Proc_2433/2025")).toBeNull();
    expect(extrairObjetoDoTitulo("Pesquisa de Preço")).toBeNull();
  });

  it("usa a mutação inversa: sem o return null não protege o caso genérico", () => {
    // confirma que o filtro de genérico está ativo — se removermos a guarda,
    // "Pesquisa de Preços" seria retornado e este teste quebraria
    const resultado = extrairObjetoDoTitulo("Pesquisa de Preços - Proc_99/2025");
    expect(resultado).toBeNull();
  });
});
