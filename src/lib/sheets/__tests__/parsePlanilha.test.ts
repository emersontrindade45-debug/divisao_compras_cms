import { describe, it, expect } from "vitest";
import { parseCsv } from "../csv";
import {
  parseNumberBR,
  parsePlanilha,
  estatisticaDoItem,
  isDataSheet,
} from "../parsePlanilha";
import { extrairSpreadsheetId, extrairNumeroProcesso } from "../googleSheets";

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

describe("parseNumberBR", () => {
  it("converte formatos pt-BR", () => {
    expect(parseNumberBR("2.327,18")).toBeCloseTo(2327.18, 2);
    expect(parseNumberBR("R$ 4.037,07")).toBeCloseTo(4037.07, 2);
    expect(parseNumberBR("4606,15")).toBeCloseTo(4606.15, 2);
    expect(parseNumberBR("997.36")).toBeCloseTo(997.36, 2);
    expect(parseNumberBR("1")).toBe(1);
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
    expect(estat.valorEstimado).toBeCloseTo(3324.54, 2);
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

// Planilha com cabeçalhos alternativos: DESCRIÇÃO em vez de MATERIAL, sem coluna de mediana
const csvDescricao = [
  '"LIMITE INFERIOR","MEDIANA ESTIMADA","LIMITE SUPERIOR","No","QTDE","DESCRIÇÃO","PREÇO PÚBLICO I","PREÇO PÚBLICO II"',
  '"500,00","1.000,00","1.500,00","1","5","Cadeira ergonômica","850,00","1.100,00"',
  '"300,00","600,00","900,00","2","10","Mesa de escritório","550,00","700,00"',
].join("\n");

// Planilha simples: apenas MATERIAL + preços, sem estatísticas
const csvSimples = [
  '"MATERIAL","PREÇO 1","PREÇO 2","PREÇO 3"',
  '"Caneta esferográfica","2,50","2,80","3,00"',
  '"Papel A4 resma","25,00","27,00","26,50"',
].join("\n");

describe("parsePlanilha — cabeçalhos alternativos (DESCRIÇÃO)", () => {
  const { itens } = parsePlanilha(parseCsv(csvDescricao));

  it("reconhece DESCRIÇÃO como coluna de material", () => {
    expect(itens).toHaveLength(2);
    expect(itens[0]!.material).toContain("Cadeira");
    expect(itens[1]!.material).toContain("Mesa");
  });

  it("detecta mediana pelo cabeçalho MEDIANA ESTIMADA", () => {
    expect(itens[0]!.mediana).toBeCloseTo(1000, 2);
    expect(itens[0]!.limiteInferior).toBeCloseTo(500, 2);
    expect(itens[0]!.limiteSuperior).toBeCloseTo(1500, 2);
  });

  it("lê os preços corretamente", () => {
    expect(itens[0]!.precos).toHaveLength(2);
    expect(itens[0]!.precos.every((p) => p.incluido)).toBe(true);
  });
});

describe("parsePlanilha — planilha simples (sem estatísticas)", () => {
  const { itens } = parsePlanilha(parseCsv(csvSimples));

  it("extrai itens mesmo sem colunas de mediana/limites", () => {
    expect(itens).toHaveLength(2);
    expect(itens[0]!.material).toContain("Caneta");
    expect(itens[1]!.material).toContain("Papel");
  });

  it("inclui todos os preços quando não há limites definidos", () => {
    expect(itens[0]!.precos).toHaveLength(3);
    expect(itens[0]!.precos.every((p) => p.incluido)).toBe(true);
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
