import { describe, expect, it } from "vitest";
import { STATUS_CONFIG, type StatusDominio } from "../status";

describe("STATUS_CONFIG", () => {
  it("mapeia aderente para success", () => {
    expect(STATUS_CONFIG.aderente).toEqual({ label: "Aderente", variant: "success" });
  });

  it("mapeia parcial para warning", () => {
    expect(STATUS_CONFIG.parcial).toEqual({ label: "Parcial", variant: "warning" });
  });

  it("mapeia nao-aderente para danger", () => {
    expect(STATUS_CONFIG["nao-aderente"]).toEqual({ label: "Não aderente", variant: "danger" });
  });

  it("mapeia pendente para neutral", () => {
    expect(STATUS_CONFIG.pendente).toEqual({ label: "Pendente", variant: "neutral" });
  });

  it("cobre exatamente os 4 status de domínio", () => {
    const keys = Object.keys(STATUS_CONFIG).sort();
    expect(keys).toEqual((["aderente", "nao-aderente", "parcial", "pendente"] satisfies StatusDominio[]).sort());
  });
});
