import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  detectarZeramentoEmMassa,
  normalizarLinhaSinapi,
  parsearLinhasSinapi,
  validarCabecalhoSinapi,
  type LinhaSinapiComposicaoSintetico,
} from "../sinapi";

/**
 * Gera um `.xlsx` em memória com a estrutura real do relatório de
 * Composições Sintético do SINAPI, medida contra o arquivo real de
 * dezembro/2024 (docs/ApiPlan-M17-spike.md §4): 3 linhas de cabeçalho de
 * contexto, 1 linha de cabeçalho de coluna, 1 linha vazia, depois os dados.
 */
function montarXlsxSinapi(linhasDados: (string | number)[][]): Buffer {
  const linhas = [
    [
      "PCI.817.01 - CUSTO DE COMPOSIÇÕES - SINTÉTICO" +
        " ".repeat(20) +
        "DATA DE EMISSÃO: 14/01/2025 00:06:43" +
        " ".repeat(12) +
        "DATA DE RT: 13/01/2025",
    ],
    ["ENCARGOS SOCIAIS SOBRE PREÇOS DA MÃO-DE-OBRA: 115,54%(HORA)   71,46%(MÊS)"],
    [
      "ABRANGÊNCIA : NACIONAL" +
        " ".repeat(20) +
        "LOCALIDADE  : SAO PAULO" +
        " ".repeat(20) +
        "DATA DE PREÇO   : 12/2024 REFERÊNCIA COLETA : MEDIANO",
    ],
    [],
    [
      "DESCRICAO DA CLASSE",
      "SIGLA DA CLASSE",
      "DESCRICAO DO TIPO 1",
      "SIGLA DO TIPO 1",
      "CODIGO DO AGRUPADOR",
      "DESCRICAO DO AGRUPADOR",
      "CODIGO  DA COMPOSICAO",
      "DESCRICAO DA COMPOSICAO",
      "UNIDADE",
      "ORIGEM DE PREÇO",
      "CUSTO TOTAL",
      "VINCULO",
    ],
    [],
    ...linhasDados,
  ];

  const ws = XLSX.utils.aoa_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const LINHA_REAL: (string | number)[] = [
  "ASSENTAMENTO DE TUBOS E PECAS",
  "ASTU",
  "FORNEC E/OU ASSENT DE TUBO DE FERRO FUNDIDO JUNTA ELASTICA",
  "0045",
  "",
  "",
  "97141",
  "ASSENTAMENTO DE TUBO DE FERRO FUNDIDO PARA REDE DE ÁGUA, DN 80 MM, JUNTA ELÁSTICA, INSTALADO EM LOCAL COM NÍVEL ALTO DE INTERFERÊNCIAS (NÃO INCLUI FORNECIMENTO). AF_05/2024",
  "M",
  "COEFICIENTE DE REPRESENTATIVIDADE",
  "5,40",
  "CAIXA REFERENCIAL",
];

const LINHA_COM_MILHAR: (string | number)[] = [
  "SERVICOS DIVERSOS",
  "SEDI",
  "OUTROS",
  "0318",
  "",
  "",
  "101460",
  "VIGIA DIURNO COM ENCARGOS COMPLEMENTARES",
  "MES",
  "COEFICIENTE DE REPRESENTATIVIDADE",
  "5.602,92",
  "ENCARGOS COMPLEMENTARES REFERENCIAL",
];

describe("validarCabecalhoSinapi", () => {
  it("aceita o cabeçalho real do relatório de Composições Sintético", () => {
    const conteudo = montarXlsxSinapi([LINHA_REAL]);
    expect(validarCabecalhoSinapi(conteudo)).toEqual({ valido: true });
  });

  it("rejeita cabeçalho com coluna faltando (layout mudou)", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["algum título"],
      ["encargos"],
      ["abrangência"],
      [],
      ["DESCRICAO DA CLASSE", "SIGLA DA CLASSE", "CODIGO  DA COMPOSICAO"], // faltam colunas
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "sheet1");
    const conteudo = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const resultado = validarCabecalhoSinapi(conteudo);
    expect(resultado.valido).toBe(false);
    expect(resultado.motivo).toMatch(/coluna|cabeçalho|layout/i);
  });

  it("rejeita arquivo que não é um XLSX válido", () => {
    const resultado = validarCabecalhoSinapi(Buffer.from("isto não é um xlsx"));
    expect(resultado.valido).toBe(false);
  });
});

describe("parsearLinhasSinapi", () => {
  it("extrai as linhas de dados, pulando os 6 cabeçalhos de contexto", () => {
    const conteudo = montarXlsxSinapi([LINHA_REAL, LINHA_COM_MILHAR]);
    const linhas = parsearLinhasSinapi(conteudo);

    expect(linhas).toHaveLength(2);
    expect(linhas[0].codigoComposicao).toBe("97141");
    expect(linhas[1].codigoComposicao).toBe("101460");
  });

  it("captura a competência e a localidade do cabeçalho de contexto", () => {
    const conteudo = montarXlsxSinapi([LINHA_REAL]);
    const linhas = parsearLinhasSinapi(conteudo);

    expect(linhas[0].competencia).toBe("2024-12");
    expect(linhas[0].localidade).toBe("SAO PAULO");
  });
});

describe("detectarZeramentoEmMassa", () => {
  const linhaComCusto = (custoTotal: string): LinhaSinapiComposicaoSintetico => ({
    descricaoClasse: "CLASSE",
    codigoComposicao: "1",
    descricaoComposicao: "DESCRICAO",
    unidade: "UN",
    custoTotal,
    vinculo: "CAIXA REFERENCIAL",
    competencia: "2025-10",
    localidade: "SAO PAULO",
  });

  it("detecta o precedente real: lote inteiro publicado com custo zerado (out-nov/2025)", () => {
    const linhas = Array.from({ length: 10 }, () => linhaComCusto("0,00"));
    const resultado = detectarZeramentoEmMassa(linhas);

    expect(resultado.suspeito).toBe(true);
    expect(resultado.proporcao).toBe(1);
  });

  it("não sinaliza quando só uma minoria das linhas está zerada", () => {
    const linhas = [
      ...Array.from({ length: 9 }, () => linhaComCusto("10,00")),
      linhaComCusto("0,00"),
    ];
    const resultado = detectarZeramentoEmMassa(linhas);

    expect(resultado.suspeito).toBe(false);
    expect(resultado.proporcao).toBeCloseTo(0.1);
  });

  it("lote vazio não é sinalizado como suspeito", () => {
    expect(detectarZeramentoEmMassa([])).toEqual({
      suspeito: false,
      totalLinhas: 0,
      linhasZeradas: 0,
      proporcao: 0,
    });
  });
});

describe("normalizarLinhaSinapi", () => {
  const linhaBase: LinhaSinapiComposicaoSintetico = {
    descricaoClasse: "ASSENTAMENTO DE TUBOS E PECAS",
    codigoComposicao: "97141",
    descricaoComposicao: "ASSENTAMENTO DE TUBO DE FERRO FUNDIDO PARA REDE DE ÁGUA, DN 80 MM",
    unidade: "M",
    custoTotal: "5,40",
    vinculo: "CAIXA REFERENCIAL",
    competencia: "2024-12",
    localidade: "SAO PAULO",
  };

  it("normaliza uma linha válida com vírgula decimal simples", () => {
    const resultado = normalizarLinhaSinapi(linhaBase, "nao_desonerado");

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.preco.codigo).toBe("97141");
      expect(resultado.preco.valorUnitario).toBeCloseTo(5.4);
      expect(resultado.preco.unidade).toBe("M");
      expect(resultado.preco.regime).toBe("nao_desonerado");
    }
  });

  it("normaliza corretamente valor com separador de milhar (5.602,92)", () => {
    const resultado = normalizarLinhaSinapi(
      { ...linhaBase, custoTotal: "5.602,92" },
      "nao_desonerado",
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.preco.valorUnitario).toBeCloseTo(5602.92);
    }
  });

  it("rejeita linha com código de composição vazio", () => {
    const resultado = normalizarLinhaSinapi({ ...linhaBase, codigoComposicao: "" }, "desonerado");
    expect(resultado.ok).toBe(false);
  });

  it("rejeita linha com custo não numérico", () => {
    const resultado = normalizarLinhaSinapi(
      { ...linhaBase, custoTotal: "" },
      "nao_desonerado",
    );
    expect(resultado.ok).toBe(false);
  });

  it("rejeita linha com custo zero ou negativo", () => {
    const resultado = normalizarLinhaSinapi({ ...linhaBase, custoTotal: "0,00" }, "desonerado");
    expect(resultado.ok).toBe(false);
  });
});

/**
 * Verificação contra arquivo real, não só fixture sintética (CLAUDE.md §9.46
 * / ApiPlan.md §5.9 — fonte nova precisa de ao menos um teste assim).
 * `SINAPI_Custo_Ref_Composicoes_Sintetico_SP_202412_NaoDesonerado.xlsx`,
 * baixado pelo usuário de caixa.gov.br em 2026-08-07 (docs/ApiPlan-M17-spike.md
 * §4) — 7.829 linhas de dados reais, dezembro/2024, São Paulo.
 */
describe("parser contra o arquivo real do SINAPI (dez/2024, SP, não desonerado)", () => {
  const caminho = join(
    __dirname,
    "../__fixtures__/sinapi_composicoes_sintetico_sp_202412.xlsx",
  );
  const conteudo = readFileSync(caminho);

  it("aceita o cabeçalho do arquivo real", () => {
    expect(validarCabecalhoSinapi(conteudo)).toEqual({ valido: true });
  });

  it("extrai todas as 7.829 linhas de dados reais, com competência e localidade corretas", () => {
    const linhas = parsearLinhasSinapi(conteudo);
    expect(linhas).toHaveLength(7829);
    expect(linhas[0]).toMatchObject({
      codigoComposicao: "97141",
      competencia: "2024-12",
      localidade: "SAO PAULO",
    });
  });

  it("normaliza a esmagadora maioria das linhas reais com sucesso", () => {
    const linhas = parsearLinhasSinapi(conteudo);
    const resultados = linhas.map((l) => normalizarLinhaSinapi(l, "nao_desonerado"));
    const ok = resultados.filter((r) => r.ok).length;

    // Não é 100% por desenho: a competência real pode ter alguma linha
    // atípica que as regras de rejeição (código/descrição/unidade vazios,
    // custo <= 0) corretamente barram — o que importa é que a esmagadora
    // maioria passa, não que nenhuma seja rejeitada.
    expect(ok).toBeGreaterThan(linhas.length * 0.99);
  });

  it("não detecta zeramento em massa numa competência normal (dez/2024)", () => {
    const linhas = parsearLinhasSinapi(conteudo);
    const resultado = detectarZeramentoEmMassa(linhas);
    expect(resultado.suspeito).toBe(false);
    expect(resultado.proporcao).toBeLessThan(0.01);
  });
});
