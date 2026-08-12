import { describe, expect, it } from "vitest";
import { redigirMemoriaCalculo } from "../memoriaCalculoCandidato";
import type { ParametrosTR, RoteiroCalculo } from "../roteiroCalculo";

const TR: ParametrosTR = {
  medida: 940,
  medidaUnidade: "m²",
  quantidade: 12,
  unidade: "unidade",
  frequencia: "semestral",
  vigenciaMeses: 24,
};

const CANDIDATO = {
  orgao: "MINISTERIO PUBLICO DO ESTADO DO PARANA",
  descricao: "Limpeza de fachadas envidraçadas",
  url: "https://pncp.gov.br/app/editais/78206307000130/2026/93",
  dataReferencia: new Date("2026-06-23T00:00:00Z"),
  vigenciaContrato: "12 meses",
};

const ROTEIRO: RoteiroCalculo = {
  valorInicial: 6.89,
  rotuloInicial: "preço do m² no contrato",
  unidadeInicial: "m²",
  passos: [
    { operacao: "multiplicacao", origem: "medida_tr" },
    { operacao: "multiplicacao", origem: "execucoes_periodo" },
  ],
};

describe("redigirMemoriaCalculo", () => {
  it("descreve a cadeia inteira, com os valores intermediários", () => {
    const texto = redigirMemoriaCalculo(ROTEIRO, TR, CANDIDATO);

    expect(texto).toBeTruthy();
    expect(texto).toContain("MINISTERIO PUBLICO DO ESTADO DO PARANA");
    expect(texto).toContain("preço do m² no contrato");
    // Valor intermediário e valor final, ambos à vista para o auditor conferir.
    expect(texto).toContain("6.476,60");
    expect(texto).toContain("25.906,40");
  });

  // "× 940" não permite refazer a conta; "pela medida do objeto no TR" permite.
  it("nomeia a origem de cada fator em vez de só imprimir o número", () => {
    const texto = redigirMemoriaCalculo(ROTEIRO, TR, CANDIDATO)!;

    expect(texto).toContain("medida do objeto no TR");
    expect(texto).toContain("execuções no período");
  });

  it("explica de onde saem as execuções no período", () => {
    const texto = redigirMemoriaCalculo(ROTEIRO, TR, CANDIDATO)!;

    expect(texto).toMatch(/frequência semestral/i);
    expect(texto).toContain("24 meses");
  });

  // As duas vigências são coisas diferentes e confundi-las custa caro: a do
  // contrato de referência é documental, a do TR é que multiplica.
  it("registra a vigência do contrato de referência sem confundir com a do TR", () => {
    const texto = redigirMemoriaCalculo(ROTEIRO, TR, CANDIDATO)!;

    expect(texto).toContain("Vigência do contrato de referência: 12 meses");
    expect(texto).toContain("vigência pretendida de 24 meses");
  });

  it("declara a grandeza do valor considerado", () => {
    const texto = redigirMemoriaCalculo(ROTEIRO, TR, CANDIDATO)!;

    expect(texto).toContain("valor do escopo do TR no período");
  });

  it("descreve roteiro sem passos como o próprio valor do contrato", () => {
    const texto = redigirMemoriaCalculo({ valorInicial: 12.5, passos: [] }, TR, CANDIDATO)!;

    expect(texto).toContain("12,50");
    expect(texto).toContain("preço por unidade do contrato");
  });

  // Texto de justificativa para um cálculo que não fecha é pior que texto
  // nenhum: pareceria justificar um número que não existe.
  it("devolve null quando o roteiro não pode ser executado", () => {
    const texto = redigirMemoriaCalculo(ROTEIRO, { ...TR, medida: null }, CANDIDATO);

    expect(texto).toBeNull();
  });

  // Campo livre para o analista complementar o texto gerado automaticamente —
  // entra como último parágrafo, depois do valor considerado.
  it("acrescenta a justificativa complementar como parágrafo final, quando informada", () => {
    const texto = redigirMemoriaCalculo(
      { ...ROTEIRO, justificativaComplementar: "Contrato inclui material de limpeza no preço." },
      TR,
      CANDIDATO,
    )!;

    expect(texto.endsWith("Contrato inclui material de limpeza no preço.")).toBe(true);
  });

  it("não acrescenta parágrafo nenhum quando a justificativa complementar está vazia", () => {
    const semComplemento = redigirMemoriaCalculo(ROTEIRO, TR, CANDIDATO)!;
    const comVazia = redigirMemoriaCalculo(
      { ...ROTEIRO, justificativaComplementar: "   " },
      TR,
      CANDIDATO,
    )!;

    expect(comVazia).toBe(semComplemento);
  });
});
