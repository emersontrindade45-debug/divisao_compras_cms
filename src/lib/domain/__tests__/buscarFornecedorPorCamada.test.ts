import { describe, it, expect } from "vitest";
import { buscarFornecedorPorCamada } from "../buscarFornecedorPorCamada";

interface FornecedorTeste {
  id: string;
  cidade: string;
  estado: string;
  categoria: string[];
}

const fornecedores: FornecedorTeste[] = [
  { id: "1", cidade: "Santos", estado: "SP", categoria: ["mobiliario"] },
  { id: "2", cidade: "Campinas", estado: "SP", categoria: ["mobiliario"] },
  { id: "3", cidade: "Curitiba", estado: "PR", categoria: ["mobiliario"] },
  { id: "4", cidade: "Santos", estado: "SP", categoria: ["informatica"] },
];

describe("buscarFornecedorPorCamada", () => {
  it("encontra fornecedor na Baixada Santista quando existe", () => {
    const resultado = buscarFornecedorPorCamada(fornecedores, "mobiliario");
    expect(resultado.camadaEncontrada).toBe("baixada_santista");
    expect(resultado.fornecedores.map((f) => f.id)).toEqual(["1"]);
  });

  it("expande para o Estado de SP quando a Baixada Santista não tem candidato", () => {
    const semBaixada = fornecedores.filter((f) => f.id !== "1");
    const resultado = buscarFornecedorPorCamada(semBaixada, "mobiliario");
    expect(resultado.camadaEncontrada).toBe("estado_sp");
    expect(resultado.fornecedores.map((f) => f.id)).toEqual(["2"]);
  });

  it("retorna null quando nenhuma camada tem candidato qualificado", () => {
    const resultado = buscarFornecedorPorCamada(fornecedores, "alimenticio");
    expect(resultado.camadaEncontrada).toBeNull();
    expect(resultado.fornecedores).toEqual([]);
  });

  it("filtra por categoria/nicho", () => {
    const resultado = buscarFornecedorPorCamada(fornecedores, "informatica");
    expect(resultado.fornecedores.map((f) => f.id)).toEqual(["4"]);
  });
});
