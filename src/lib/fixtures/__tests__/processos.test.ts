import { describe, expect, it } from "vitest";
import { PROCESSOS, getProcessoById, getResponsaveis } from "../processos";

describe("fixtures de processos", () => {
  it("expõe 8 processos", () => {
    expect(PROCESSOS).toHaveLength(8);
  });

  it("todo processo tem id único", () => {
    const ids = PROCESSOS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cobre os quatro status do domínio", () => {
    const status = new Set(PROCESSOS.map((p) => p.status));
    expect(status).toEqual(new Set(["aderente", "parcial", "nao-aderente", "pendente"]));
  });

  it("getProcessoById retorna o processo correto", () => {
    const primeiro = PROCESSOS[0];
    expect(getProcessoById(primeiro.id)).toEqual(primeiro);
  });

  it("getProcessoById retorna undefined para id inexistente", () => {
    expect(getProcessoById("nao-existe")).toBeUndefined();
  });

  it("getResponsaveis retorna nomes únicos ordenados", () => {
    const resp = getResponsaveis();
    const ordenado = [...resp].sort((a, b) => a.localeCompare(b, "pt-BR"));
    expect(resp).toEqual(ordenado);
    expect(new Set(resp).size).toBe(resp.length);
  });
});
