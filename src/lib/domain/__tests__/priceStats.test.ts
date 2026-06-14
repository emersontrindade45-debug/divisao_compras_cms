import { describe, it, expect } from "vitest";
import {
  excluirDiscrepantes,
  calcularEstatisticas,
  validarEvidenciasFontes,
} from "../priceStats";

describe("excluirDiscrepantes", () => {
  it("exclui preço 31% acima da mediana para aquisição", () => {
    // mediana = 100, limite superior = 130, preço 131 deve ser excluído
    const { incluidos, excluidos } = excluirDiscrepantes([100, 100, 100, 131], "aquisicao");
    expect(excluidos).toContain(131);
    expect(incluidos).not.toContain(131);
  });

  it("inclui preço 29% acima da mediana para aquisição", () => {
    const { incluidos } = excluirDiscrepantes([100, 100, 100, 129], "aquisicao");
    expect(incluidos).toContain(129);
  });

  it("inclui preço 74% acima da mediana para obra", () => {
    const { incluidos } = excluirDiscrepantes([100, 100, 100, 174], "obra");
    expect(incluidos).toContain(174);
  });

  it("exclui preço 76% acima da mediana para obra", () => {
    const { excluidos } = excluirDiscrepantes([100, 100, 100, 176], "obra");
    expect(excluidos).toContain(176);
  });

  it("retorna vazio para lista vazia", () => {
    const result = excluirDiscrepantes([], "aquisicao");
    expect(result.incluidos).toHaveLength(0);
    expect(result.excluidos).toHaveLength(0);
    expect(result.limiteInferior).toBe(0);
    expect(result.limiteSuperior).toBe(0);
  });

  it("não exclui nenhum com lista de 1 elemento", () => {
    const { incluidos, excluidos } = excluirDiscrepantes([100], "aquisicao");
    expect(incluidos).toHaveLength(1);
    expect(excluidos).toHaveLength(0);
  });
});

describe("calcularEstatisticas", () => {
  it("retorna valid: false e violation OP-ADH-04 com menos de 3 preços", () => {
    const result = calcularEstatisticas([100, 200], "media");
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "OP-ADH-04" && v.severity === "block")).toBe(true);
  });

  it("retorna violation warn R-06 quando CV > 30%", () => {
    // preços com alta dispersão: CV >> 30%
    const result = calcularEstatisticas([100, 100, 500], "media");
    expect(result.valid).toBe(true); // sem block, mas tem warn
    expect(result.violations.some((v) => v.code === "R-06" && v.severity === "warn")).toBe(true);
  });

  it("não gera violations quando tudo válido e CV <= 30%", () => {
    const result = calcularEstatisticas([100, 105, 110], "media");
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("calcula mediana corretamente para lista par (média dos dois centrais)", () => {
    // [100, 200, 300, 400] → dois centrais 200 e 300 → mediana 250
    const result = calcularEstatisticas([100, 200, 300, 400], "mediana");
    expect(result.value.mediana).toBe(250);
  });

  it("usa menor valor quando metodo é menor_valor", () => {
    const result = calcularEstatisticas([100, 200, 300], "menor_valor");
    expect(result.value.valorEstimado).toBe(100);
  });

  it("calcula valorEstimado como média quando metodo é media", () => {
    const result = calcularEstatisticas([100, 200, 300], "media");
    expect(result.value.valorEstimado).toBeCloseTo(200, 2);
  });
});

describe("validarEvidenciasFontes", () => {
  it("retorna valid: false e violation R-02 para fonte sem evidência", () => {
    const result = validarEvidenciasFontes([{ id: "f1", evidencias: [] }]);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "R-02")).toBe(true);
    expect(result.value.find((v) => v.fonteId === "f1")?.valida).toBe(false);
  });

  it("retorna valid: true quando todas as fontes têm evidência", () => {
    const result = validarEvidenciasFontes([
      { id: "f1", evidencias: [{ dataHoraAcesso: new Date() }] },
      { id: "f2", evidencias: [{ dataHoraAcesso: new Date() }] },
    ]);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("retorna valid: false quando apenas uma fonte falha", () => {
    const result = validarEvidenciasFontes([
      { id: "f1", evidencias: [{ dataHoraAcesso: new Date() }] },
      { id: "f2", evidencias: [] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.value.find((v) => v.fonteId === "f1")?.valida).toBe(true);
    expect(result.value.find((v) => v.fonteId === "f2")?.valida).toBe(false);
  });
});
