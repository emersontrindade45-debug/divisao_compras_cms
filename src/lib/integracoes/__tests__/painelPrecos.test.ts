import { describe, it, expect } from "vitest";
import { buscarPrecosPainelPrecos } from "../painelPrecos";

describe("buscarPrecosPainelPrecos", () => {
  it("retorna lista vazia (integração desativada — sem busca por texto livre na API pública)", async () => {
    const resultado = await buscarPrecosPainelPrecos("qualquer coisa");
    expect(resultado).toEqual([]);
  });
});
