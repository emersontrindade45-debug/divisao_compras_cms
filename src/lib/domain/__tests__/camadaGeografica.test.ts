import { describe, it, expect } from "vitest";
import { CAMADAS_GEOGRAFICAS, proximaCamada } from "../camadaGeografica";

describe("camadaGeografica", () => {
  it("define as 5 camadas na ordem correta", () => {
    expect(CAMADAS_GEOGRAFICAS.map((c) => c.nome)).toEqual([
      "baixada_santista",
      "estado_sp",
      "sudeste",
      "sul",
      "centro_oeste",
    ]);
  });

  it("baixada_santista contém Santos e cidades vizinhas", () => {
    const baixada = CAMADAS_GEOGRAFICAS[0]!;
    expect(baixada.cidades).toContain("Santos");
    expect(baixada.cidades).toContain("São Vicente");
  });

  it("retorna a proxima camada", () => {
    expect(proximaCamada("baixada_santista")).toBe("estado_sp");
    expect(proximaCamada("sul")).toBe("centro_oeste");
  });

  it("retorna null após a ultima camada", () => {
    expect(proximaCamada("centro_oeste")).toBeNull();
  });
});
