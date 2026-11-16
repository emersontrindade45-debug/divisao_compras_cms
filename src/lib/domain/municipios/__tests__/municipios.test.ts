import { describe, expect, it } from "vitest";
import {
  buscarMunicipios,
  ehCodigoMunicipioValido,
  municipioEstaNaSelecao,
  municipioPorCodigo,
  rotuloMunicipio,
} from "../municipios";

describe("lista de municípios do IBGE", () => {
  it("tem todos os municípios, com o código IBGE de 7 dígitos", () => {
    expect(municipioPorCodigo(3548500)).toEqual({ codigo: 3548500, nome: "Santos", uf: "SP" });
    expect(municipioPorCodigo(3550308)?.nome).toBe("São Paulo");
    // Criado em 2023, sem microrregião na API do IBGE — o caso que quebrava a extração.
    expect(municipioPorCodigo(5101837)).toEqual({
      codigo: 5101837,
      nome: "Boa Esperança do Norte",
      uf: "MT",
    });
  });

  it("recusa código inexistente (o PNCP devolveria 0 sem erro)", () => {
    expect(ehCodigoMunicipioValido(3548500)).toBe(true);
    expect(ehCodigoMunicipioValido(9999999)).toBe(false);
    // O id interno do PNCP para São Paulo (`municipio_id: "3830"`) não é código IBGE.
    expect(ehCodigoMunicipioValido(3830)).toBe(false);
  });
});

describe("buscarMunicipios", () => {
  it("ignora acento e caixa", () => {
    const nomes = buscarMunicipios("sao vicente").map(rotuloMunicipio);
    expect(nomes).toContain("São Vicente/SP");
  });

  it("põe quem começa com o termo antes de quem só o contém", () => {
    const resultado = buscarMunicipios("santos", 50).map(rotuloMunicipio);
    expect(resultado.indexOf("Santos/SP")).toBeGreaterThanOrEqual(0);
    const primeiroQueSoContem = resultado.findIndex((r) => !r.toLowerCase().startsWith("santos"));
    const ultimoQueComeca = resultado.map((r) => r.toLowerCase().startsWith("santos")).lastIndexOf(true);
    expect(primeiroQueSoContem === -1 || ultimoQueComeca < primeiroQueSoContem).toBe(true);
  });

  it("desambigua homônimos pelo sufixo de UF", () => {
    // Há "Bom Jesus" em várias UFs.
    expect(buscarMunicipios("bom jesus", 50).length).toBeGreaterThan(1);
    const soPi = buscarMunicipios("bom jesus/PI", 50);
    expect(soPi.length).toBeGreaterThan(0);
    expect(soPi.every((m) => m.uf === "PI")).toBe(true);
    expect(buscarMunicipios("santos sp").map(rotuloMunicipio)[0]).toBe("Santos/SP");
  });

  it("não busca com menos de 2 letras e respeita o limite", () => {
    expect(buscarMunicipios("s")).toEqual([]);
    expect(buscarMunicipios("sa", 5)).toHaveLength(5);
  });
});

describe("municipioEstaNaSelecao", () => {
  const selecao = [municipioPorCodigo(3513504)!, municipioPorCodigo(3548500)!]; // Cubatão, Santos

  it("casa o nome vindo da fonte sem acento e em maiúsculas", () => {
    expect(municipioEstaNaSelecao("CUBATAO", "SP", selecao)).toBe(true);
    expect(municipioEstaNaSelecao("Santos", "sp", selecao)).toBe(true);
  });

  it("não casa cidade de fora nem homônimo de outra UF", () => {
    expect(municipioEstaNaSelecao("MANAUS", "AM", selecao)).toBe(false);
    expect(municipioEstaNaSelecao("SANTOS", "MG", selecao)).toBe(false);
    expect(municipioEstaNaSelecao(null, "SP", selecao)).toBe(false);
  });
});
